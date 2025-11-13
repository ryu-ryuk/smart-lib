package main

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	_ "github.com/lib/pq"
	"go.etcd.io/bbolt"
)

type Config struct {
	PGURL             string
	DeviceTokenSecret string
	BufferDBPath      string
	Port              string
}

type EventRequest struct {
	EventID     string `json:"event_id"`
	DeviceID    string `json:"device_id"`
	AdmissionNo string `json:"admission_no,omitempty"` // Optional: if RFID UID is provided
	RFIDUID     string `json:"rfid_uid,omitempty"`     // RFID card UID (hex string)
	TS          string `json:"ts"`
}

type Gateway struct {
	db       *sql.DB
	bufferDB *bbolt.DB
	config   Config
	metrics  *Metrics
}

type Metrics struct {
	EventsReceived int64
	EventsBuffered int64
	EventsFlushed  int64
	DBWriteErrors  int64
}

type RFIDNotRegisteredError struct {
	UID string
}

func (e *RFIDNotRegisteredError) Error() string {
	return fmt.Sprintf("rfid card not registered: %s", e.UID)
}

func (g *Gateway) recordUnassignedEvent(req EventRequest) {
	if req.RFIDUID == "" {
		return
	}

	seenTime := time.Now()
	if parsed, err := time.Parse(time.RFC3339, req.TS); err == nil {
		seenTime = parsed
	}

	payload := map[string]any{
		"event_id":  req.EventID,
		"device_id": req.DeviceID,
		"ts":        req.TS,
	}
	if req.AdmissionNo != "" {
		payload["admission_no"] = req.AdmissionNo
	}

	raw, err := json.Marshal(payload)
	if err != nil {
		log.Printf("Failed to marshal unassigned RFID payload: %v", err)
		return
	}

	_, err = g.db.Exec(
		`INSERT INTO rfid_unassigned (rfid_uid, first_seen, last_seen, seen_count, device_id, last_event)
		 VALUES ($1, $2, $2, 1, $3, $4)
		 ON CONFLICT (rfid_uid) DO UPDATE
		   SET last_seen = EXCLUDED.last_seen,
		       seen_count = rfid_unassigned.seen_count + 1,
		       device_id = EXCLUDED.device_id,
		       last_event = EXCLUDED.last_event`,
		strings.ToUpper(req.RFIDUID),
		seenTime,
		req.DeviceID,
		string(raw),
	)
	if err != nil {
		log.Printf("Failed to record unassigned RFID %s: %v", req.RFIDUID, err)
	}
}

func main() {
	config := Config{
		PGURL:             getEnv("PG_URL", "postgres://user:pass@localhost/attendance?sslmode=disable"),
		DeviceTokenSecret: getEnv("DEVICE_TOKEN_SECRET", ""),
		BufferDBPath:      getEnv("BUFFER_DB_PATH", "/tmp/gateway-buffer.db"),
		Port:              getEnv("PORT", "8080"),
	}

	db, err := sql.Open("postgres", config.PGURL)
	if err != nil {
		log.Fatalf("Failed to connect to DB: %v", err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		log.Fatalf("Failed to ping DB: %v", err)
	}

	bufferDB, err := bbolt.Open(config.BufferDBPath, 0600, nil)
	if err != nil {
		log.Fatalf("Failed to open buffer DB: %v", err)
	}
	defer bufferDB.Close()

	// Initialize buffer bucket
	bufferDB.Update(func(tx *bbolt.Tx) error {
		_, err := tx.CreateBucketIfNotExists([]byte("events"))
		return err
	})

	gateway := &Gateway{
		db:       db,
		bufferDB: bufferDB,
		config:   config,
		metrics:  &Metrics{},
	}

	// Start retry worker
	go gateway.retryWorker()

	// Start metrics endpoint
	if os.Getenv("PROMETHEUS_ENABLED") == "true" {
		http.HandleFunc("/metrics", gateway.metricsHandler)
	}

	http.HandleFunc("/health", gateway.healthHandler)
	http.HandleFunc("/api/events", gateway.eventsHandler)

	log.Printf("Gateway listening on :%s", config.Port)
	log.Fatal(http.ListenAndServe(":"+config.Port, nil))
}

func (g *Gateway) healthHandler(w http.ResponseWriter, r *http.Request) {
	if err := g.db.Ping(); err != nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		json.NewEncoder(w).Encode(map[string]string{"status": "unhealthy", "error": err.Error()})
		return
	}
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "healthy"})
}

func (g *Gateway) metricsHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/plain")
	fmt.Fprintf(w, "# Gateway Metrics\n")
	fmt.Fprintf(w, "events_received_total %d\n", g.metrics.EventsReceived)
	fmt.Fprintf(w, "events_buffered_total %d\n", g.metrics.EventsBuffered)
	fmt.Fprintf(w, "events_flushed_total %d\n", g.metrics.EventsFlushed)
	fmt.Fprintf(w, "db_write_errors_total %d\n", g.metrics.DBWriteErrors)
}

func (g *Gateway) eventsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	// Authenticate device
	deviceToken := r.Header.Get("X-Device-Token")
	if deviceToken == "" {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{"error": "missing X-Device-Token"})
		return
	}

	deviceID, err := g.authenticateDevice(deviceToken)
	if err != nil {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{"error": "invalid device token"})
		return
	}

	// Parse request
	var req EventRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "invalid JSON"})
		return
	}

	req.DeviceID = deviceID // Override with authenticated device ID
	g.metrics.EventsReceived++

	// Try to write to DB
	if err := g.writeEvent(req); err != nil {
		var rfidErr *RFIDNotRegisteredError
		if errors.As(err, &rfidErr) {
			g.recordUnassignedEvent(req)
			log.Printf("RFID UID %s not found in database; register the card and scan again.", rfidErr.UID)
			w.WriteHeader(http.StatusAccepted)
			return
		}

		log.Printf("Failed to write event: %v, buffering", err)
		g.metrics.DBWriteErrors++

		// Buffer event
		if err := g.bufferEvent(req); err != nil {
			log.Printf("Failed to buffer event: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		g.metrics.EventsBuffered++
		w.WriteHeader(http.StatusAccepted) // 202 Accepted
		return
	}

	w.WriteHeader(http.StatusCreated) // 201 Created
}

func (g *Gateway) authenticateDevice(token string) (string, error) {
	// Hash token
	hash := sha256.Sum256([]byte(token))
	hashStr := hex.EncodeToString(hash[:])

	var deviceID string
	err := g.db.QueryRow(
		"SELECT device_id FROM device_registry WHERE token_hash = $1",
		hashStr,
	).Scan(&deviceID)

	return deviceID, err
}

func (g *Gateway) writeEvent(req EventRequest) error {
	tx, err := g.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// If RFID UID is provided, look up admission_no
	admissionNo := req.AdmissionNo
	if admissionNo == "" && req.RFIDUID != "" {
		err = tx.QueryRow(
			"SELECT admission_no FROM students WHERE rfid_uid = $1",
			strings.ToUpper(req.RFIDUID), // Normalize to uppercase
		).Scan(&admissionNo)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return &RFIDNotRegisteredError{UID: strings.ToUpper(req.RFIDUID)}
			}
			log.Printf("RFID UID %s lookup failed: %v", req.RFIDUID, err)
			return fmt.Errorf("RFID lookup failed: %w", err)
		}
		log.Printf("Mapped RFID UID %s to admission_no %s", req.RFIDUID, admissionNo)
	}

	if admissionNo == "" {
		return fmt.Errorf("missing admission_no or rfid_uid")
	}

	// Parse timestamp
	ts, err := time.Parse(time.RFC3339, req.TS)
	if err != nil {
		ts = time.Now() // Fallback to server time
	} else {
		// Many devices start at Unix epoch (1970) until they sync time.
		// Treat obviously invalid timestamps as "now" so dashboards don't show 1970.
		cutoff := time.Date(2000, 1, 1, 0, 0, 0, 0, time.UTC)
		if ts.Before(cutoff) || ts.After(time.Now().Add(24*time.Hour)) {
			ts = time.Now()
		}
	}

	// Build raw_json with both admission_no and rfid_uid if present
	rawJSON := fmt.Sprintf(`{"event_id":"%s","device_id":"%s","admission_no":"%s"`, req.EventID, req.DeviceID, admissionNo)
	if req.RFIDUID != "" {
		rawJSON += fmt.Sprintf(`,"rfid_uid":"%s"`, req.RFIDUID)
	}
	rawJSON += "}"

	// Insert into events_raw (idempotent by event_id)
	_, err = tx.Exec(
		`INSERT INTO events_raw (event_id, device_id, admission_no, ts, raw_json)
		 VALUES ($1, $2, $3, $4, $5)
		 ON CONFLICT (event_id) DO NOTHING`,
		req.EventID, req.DeviceID, admissionNo, ts, rawJSON,
	)
	if err != nil {
		return err
	}

	// Determine event type (entry/exit) based on attendance_state
	var lastEventType sql.NullString
	err = tx.QueryRow(
		"SELECT last_event_type FROM attendance_state WHERE admission_no = $1 FOR UPDATE",
		admissionNo,
	).Scan(&lastEventType)

	eventType := "entry"
	if err == nil && lastEventType.Valid && lastEventType.String == "entry" {
		eventType = "exit"
	}

	// Insert into attendance (idempotent by event_id)
	_, err = tx.Exec(
		`INSERT INTO attendance (event_id, admission_no, event_type, ts, device_id)
		 VALUES ($1, $2, $3, $4, $5)
		 ON CONFLICT (event_id) DO NOTHING`,
		req.EventID, admissionNo, eventType, ts, req.DeviceID,
	)
	if err != nil {
		return err
	}

	// Upsert attendance_state
	_, err = tx.Exec(
		`INSERT INTO attendance_state (admission_no, last_event_type, last_ts)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (admission_no) DO UPDATE
		 SET last_event_type = $2, last_ts = $3`,
		admissionNo, eventType, ts,
	)
	if err != nil {
		return err
	}

	return tx.Commit()
}

func (g *Gateway) bufferEvent(req EventRequest) error {
	data, err := json.Marshal(req)
	if err != nil {
		return err
	}

	return g.bufferDB.Update(func(tx *bbolt.Tx) error {
		bucket := tx.Bucket([]byte("events"))
		return bucket.Put([]byte(req.EventID), data)
	})
}

func (g *Gateway) retryWorker() {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		var events []EventRequest

		// Read buffered events
		g.bufferDB.View(func(tx *bbolt.Tx) error {
			bucket := tx.Bucket([]byte("events"))
			return bucket.ForEach(func(k, v []byte) error {
				var req EventRequest
				if err := json.Unmarshal(v, &req); err == nil {
					events = append(events, req)
				}
				return nil
			})
		})

		// Retry each event
		for _, req := range events {
			err := g.writeEvent(req)
			if err == nil {
				// Success - remove from buffer
				g.bufferDB.Update(func(tx *bbolt.Tx) error {
					bucket := tx.Bucket([]byte("events"))
					return bucket.Delete([]byte(req.EventID))
				})
				g.metrics.EventsFlushed++
				log.Printf("Flushed buffered event: %s", req.EventID)
				continue
			}
			var rfidErr *RFIDNotRegisteredError
			if errors.As(err, &rfidErr) {
				g.recordUnassignedEvent(req)
				// Drop the buffered event to avoid tight retry loops.
				g.bufferDB.Update(func(tx *bbolt.Tx) error {
					bucket := tx.Bucket([]byte("events"))
					return bucket.Delete([]byte(req.EventID))
				})
				log.Printf("Dropped buffered event %s: RFID UID %s is still unregistered.", req.EventID, rfidErr.UID)
			}
		}
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
