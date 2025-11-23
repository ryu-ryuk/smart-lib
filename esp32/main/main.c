#include <stdio.h>
#include <string.h>
#include <strings.h>
#include <inttypes.h>
#include <sys/time.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/semphr.h"
#include "esp_system.h"
#include "esp_err.h"
#include "esp_wifi.h"
#include "esp_event.h"
#include "esp_log.h"
#include "esp_http_client.h"
#include "esp_timer.h"
#include "nvs_flash.h"
#include "driver/gpio.h"
#include "driver/spi_master.h"
#include "ssd1306.h"
#include "config.h"

static const char *TAG = "ATTENDANCE";

// Debounce window when sending events to the backend
static int64_t last_scan_time = 0;
static const int64_t DEBOUNCE_MS = 2000;

// SPI handle for direct MFRC522 communication
static spi_device_handle_t rc522_spi = NULL;
static bool rc522_initialized = false;

// MFRC522 register map 
#define RC522_REG_COMMAND          0x01
#define RC522_REG_COMM_IE          0x02
#define RC522_REG_COMM_IRQ         0x04
#define RC522_REG_DIV_IRQ          0x05
#define RC522_REG_ERROR            0x06
#define RC522_REG_STATUS1          0x07
#define RC522_REG_FIFO_DATA        0x09
#define RC522_REG_FIFO_LEVEL       0x0A
#define RC522_REG_CONTROL          0x0C
#define RC522_REG_BIT_FRAMING      0x0D
#define RC522_REG_MODE             0x11
#define RC522_REG_TX_CONTROL       0x14
#define RC522_REG_TX_ASK           0x15
#define RC522_REG_CRC_RESULT_L     0x22
#define RC522_REG_CRC_RESULT_H     0x21
#define RC522_REG_RFCFG            0x26
#define RC522_REG_T_MODE           0x2A
#define RC522_REG_T_PRESCALER      0x2B
#define RC522_REG_T_RELOAD_L       0x2D
#define RC522_REG_T_RELOAD_H       0x2C
#define RC522_REG_VERSION          0x37

// MFRC522 command set 
#define RC522_CMD_IDLE             0x00
#define RC522_CMD_CALC_CRC         0x03
#define RC522_CMD_TRANSCEIVE       0x0C
#define RC522_CMD_SOFT_RESET       0x0F

// ISO14443A commands
#define PICC_REQIDL                0x26
#define PICC_ANTICOLL_CL1          0x93

// Utility macros
#define MFRC522_MAX_LEN            18

static bool oled_ready = false;

#define RFID_CACHE_SIZE 16

typedef struct {
    bool used;
    char uid[21];
    char name[64];
    char next_event[6]; // "entry" or "exit"
} rfid_cache_entry_t;

static rfid_cache_entry_t rfid_cache[RFID_CACHE_SIZE];

static void oled_show_message(const char *line1, const char *line2) {
    if (!oled_ready) {
        return;
    }
    ssd1306_clear();
    if (line1) {
        ssd1306_draw_text(0, 0, line1);
    }
    if (line2) {
        ssd1306_draw_text(2, 0, line2);
    }
}

static void oled_show_event(const char *name, bool is_entry) {
    if (!oled_ready) {
        return;
    }
    char line1[22];
    snprintf(line1, sizeof(line1), "%s: %s", is_entry ? "ENTRY" : "EXIT", name);
    char line2[18];
    snprintf(line2, sizeof(line2), "%s", is_entry ? "Welcome :D" : "Bye Bye :(");
    ssd1306_clear();
    ssd1306_draw_text(0, 0, line1);
    ssd1306_draw_text(2, 0, line2);
}

static rfid_cache_entry_t* rfid_cache_get(const char *uid) {
    for (int i = 0; i < RFID_CACHE_SIZE; i++) {
        if (rfid_cache[i].used && strcmp(rfid_cache[i].uid, uid) == 0) {
            return &rfid_cache[i];
        }
    }
    for (int i = 0; i < RFID_CACHE_SIZE; i++) {
        if (!rfid_cache[i].used) {
            rfid_cache[i].used = true;
            strncpy(rfid_cache[i].uid, uid, sizeof(rfid_cache[i].uid) - 1);
            rfid_cache[i].uid[sizeof(rfid_cache[i].uid) - 1] = '\0';
            rfid_cache[i].name[0] = '\0';
            strcpy(rfid_cache[i].next_event, "entry");
            return &rfid_cache[i];
        }
    }
    // overwrite first entry if cache is full
    rfid_cache[0].used = true;
    strncpy(rfid_cache[0].uid, uid, sizeof(rfid_cache[0].uid) - 1);
    rfid_cache[0].uid[sizeof(rfid_cache[0].uid) - 1] = '\0';
    rfid_cache[0].name[0] = '\0';
    strcpy(rfid_cache[0].next_event, "entry");
    return &rfid_cache[0];
}

static bool json_extract_string(const char *json, const char *key, char *out, size_t out_len) {
    char pattern[32];
    snprintf(pattern, sizeof(pattern), "\"%s\":\"", key);
    const char *start = strstr(json, pattern);
    if (!start) return false;
    start += strlen(pattern);
    const char *end = strchr(start, '"');
    if (!end) return false;
    size_t len = end - start;
    if (len >= out_len) len = out_len - 1;
    memcpy(out, start, len);
    out[len] = '\0';
    return true;
}

static esp_err_t fetch_student_info(const char *uid, rfid_cache_entry_t *entry) {
    char url[256];
    snprintf(url, sizeof(url), ADMIN_API_URL "/students/by-rfid/%s", uid);
    esp_http_client_config_t cfg = {
        .url = url,
        .method = HTTP_METHOD_GET,
        .timeout_ms = 3000,
    };
    esp_http_client_handle_t client = esp_http_client_init(&cfg);
    if (!client) {
        return ESP_FAIL;
    }

    esp_err_t err = esp_http_client_perform(client);
    if (err != ESP_OK) {
        esp_http_client_cleanup(client);
        return err;
    }

    int status = esp_http_client_get_status_code(client);
    if (status != 200) {
        esp_http_client_cleanup(client);
        return ESP_FAIL;
    }

    char response[256];
    int read_len = esp_http_client_read_response(client, response, sizeof(response) - 1);
    if (read_len <= 0) {
        esp_http_client_cleanup(client);
        return ESP_FAIL;
    }
    response[read_len] = '\0';

    char name[64];
    if (!json_extract_string(response, "name", name, sizeof(name))) {
        snprintf(name, sizeof(name), "%s", uid);
    }
    strncpy(entry->name, name, sizeof(entry->name) - 1);
    entry->name[sizeof(entry->name) - 1] = '\0';

    char next_event[6];
    if (json_extract_string(response, "next_event_type", next_event, sizeof(next_event))) {
        strncpy(entry->next_event, next_event, sizeof(entry->next_event) - 1);
        entry->next_event[sizeof(entry->next_event) - 1] = '\0';
    } else {
        strcpy(entry->next_event, "entry");
    }

    esp_http_client_cleanup(client);
    return ESP_OK;
}

static void init_oled_display(void) {
    if (oled_ready) {
        return;
    }

    ssd1306_config_t cfg = {
        .i2c_port = OLED_I2C_PORT,
        .sda_io = OLED_SDA_PIN,
        .scl_io = OLED_SCL_PIN,
        .clk_speed_hz = 400000,
        .i2c_address = OLED_I2C_ADDR,
    };

    if (ssd1306_init(&cfg) == ESP_OK) {
        oled_ready = true;
        oled_show_message("RFID System", "Booting...");
    } else {
        ESP_LOGW(TAG, "OLED init failed");
    }
}

// WiFi event handler
static void wifi_event_handler(void* arg, esp_event_base_t event_base,
                            int32_t event_id, void* event_data) {
    if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_START) {
        esp_wifi_connect();
        ESP_LOGI(TAG, "WiFi connecting to: %s", WIFI_SSID);
        oled_show_message("WiFi", "Connecting...");
    } else if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_DISCONNECTED) {
        wifi_event_sta_disconnected_t* disconnected = (wifi_event_sta_disconnected_t*) event_data;
        ESP_LOGW(TAG, "WiFi disconnected (reason: %d), retrying...", disconnected->reason);
        vTaskDelay(pdMS_TO_TICKS(2000));
        esp_wifi_connect();
        oled_show_message("WiFi", "Reconnecting...");
    } else if (event_base == IP_EVENT && event_id == IP_EVENT_STA_GOT_IP) {
        ip_event_got_ip_t* event = (ip_event_got_ip_t*) event_data;
        ESP_LOGI(TAG, "WiFi connected! IP: " IPSTR, IP2STR(&event->ip_info.ip));
        ESP_LOGI(TAG, "Gateway URL: %s", GATEWAY_URL);
        char ip_line[32];
        snprintf(ip_line, sizeof(ip_line), "IP: " IPSTR, IP2STR(&event->ip_info.ip));
        oled_show_message("WiFi Connected", ip_line);
    }
}

// Initialize WiFi (unchanged from previous implementation)
static void wifi_init(void) {
    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    esp_netif_create_default_wifi_sta();

    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&cfg));

    ESP_ERROR_CHECK(esp_event_handler_register(WIFI_EVENT, ESP_EVENT_ANY_ID, &wifi_event_handler, NULL));
    ESP_ERROR_CHECK(esp_event_handler_register(IP_EVENT, IP_EVENT_STA_GOT_IP, &wifi_event_handler, NULL));

    wifi_config_t wifi_config = {
        .sta = {
            .ssid = WIFI_SSID,
            .password = WIFI_PASSWORD,
        },
    };
    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wifi_config));
    ESP_ERROR_CHECK(esp_wifi_start());
    ESP_LOGI(TAG, "WiFi initialized");
}

// Get current timestamp in RFC3339 format
static void get_rfc3339_timestamp(char* buffer, size_t len) {
    struct timeval tv;
    gettimeofday(&tv, NULL);
    struct tm timeinfo;
    localtime_r(&tv.tv_sec, &timeinfo);

    snprintf(buffer, len, "%04d-%02d-%02dT%02d:%02d:%02d.%03" PRId32 "Z",
             timeinfo.tm_year + 1900,
             timeinfo.tm_mon + 1,
             timeinfo.tm_mday,
             timeinfo.tm_hour,
             timeinfo.tm_min,
             timeinfo.tm_sec,
             (int32_t)(tv.tv_usec / 1000));
}

// Generate UUID v4 (simplified)
static void generate_uuid(char* uuid) {
    uint32_t random_values[4];
    for (int i = 0; i < 4; i++) {
        random_values[i] = esp_random();
    }
    snprintf(uuid, 37, "%08" PRIx32 "-%04" PRIx32 "-%04" PRIx32 "-%04" PRIx32 "-%08" PRIx32 "%04" PRIx32,
             random_values[0],
             (random_values[1] >> 16) & 0xFFFF,
             random_values[1] & 0xFFFF,
             (random_values[2] >> 16) & 0xFFFF,
             random_values[2] & 0xFFFF,
             random_values[3] & 0xFFFF);
}

// HTTP event handler
esp_err_t http_event_handler(esp_http_client_event_t *evt) {
    switch(evt->event_id) {
        case HTTP_EVENT_ERROR:
            ESP_LOGD(TAG, "HTTP_EVENT_ERROR");
            break;
        case HTTP_EVENT_ON_CONNECTED:
            ESP_LOGD(TAG, "HTTP_EVENT_ON_CONNECTED");
            break;
        case HTTP_EVENT_HEADER_SENT:
            ESP_LOGD(TAG, "HTTP_EVENT_HEADER_SENT");
            break;
        case HTTP_EVENT_ON_HEADER:
            ESP_LOGD(TAG, "HTTP_EVENT_ON_HEADER, key=%s, value=%s", evt->header_key, evt->header_value);
            break;
        case HTTP_EVENT_ON_DATA:
            ESP_LOGD(TAG, "HTTP_EVENT_ON_DATA, len=%d", evt->data_len);
            break;
        case HTTP_EVENT_ON_FINISH:
            ESP_LOGI(TAG, "HTTP_EVENT_ON_FINISH");
            break;
        case HTTP_EVENT_DISCONNECTED:
            ESP_LOGI(TAG, "HTTP_EVENT_DISCONNECTED");
            break;
        default:
            break;
    }
    return ESP_OK;
}

// Send event to gateway
static void send_event_to_gateway(const char* rfid_uid) {
    int64_t now_ms = esp_timer_get_time() / 1000;

    if (now_ms - last_scan_time < DEBOUNCE_MS) {
        ESP_LOGW(TAG, "Ignoring duplicate scan (debounce)");
        return;
    }
    last_scan_time = now_ms;

    char event_id[37];
    char timestamp[30];
    generate_uuid(event_id);
    get_rfc3339_timestamp(timestamp, sizeof(timestamp));

    char json_string[256];
    snprintf(json_string, sizeof(json_string),
        "{\"event_id\":\"%s\",\"device_id\":\"%s\",\"rfid_uid\":\"%s\",\"ts\":\"%s\"}",
        event_id, DEVICE_ID, rfid_uid, timestamp);
    ESP_LOGI(TAG, "Sending event: %s", json_string);

    esp_http_client_config_t config = {
        .url = GATEWAY_URL "/api/events",
        .event_handler = http_event_handler,
        .method = HTTP_METHOD_POST,
    };
    esp_http_client_handle_t client = esp_http_client_init(&config);

    esp_http_client_set_header(client, "Content-Type", "application/json");
    esp_http_client_set_header(client, "X-Device-Token", DEVICE_TOKEN);

    esp_http_client_set_post_field(client, json_string, strlen(json_string));

    esp_err_t err = esp_http_client_perform(client);
    int status_code = esp_http_client_get_status_code(client);

    if (err == ESP_OK && (status_code == 201 || status_code == 202)) {
        ESP_LOGI(TAG, "Event sent successfully (status: %d)", status_code);
    } else {
        ESP_LOGE(TAG, "Failed to send event: %s, status: %d", esp_err_to_name(err), status_code);
    }

    esp_http_client_cleanup(client);
}

// Low-level SPI helpers mapped from the Lua reference implementation
static esp_err_t rc522_write_reg(uint8_t reg, uint8_t value) {
    if (!rc522_spi) {
        return ESP_ERR_INVALID_STATE;
    }

    spi_transaction_t t = {
        .flags = SPI_TRANS_USE_TXDATA,
        .length = 16,
    };
    t.tx_data[0] = (uint8_t)((reg << 1) & 0x7E);
    t.tx_data[1] = value;
    return spi_device_transmit(rc522_spi, &t);
}

static esp_err_t rc522_read_reg(uint8_t reg, uint8_t *value) {
    if (!rc522_spi || !value) {
        return ESP_ERR_INVALID_STATE;
    }

    spi_transaction_t t = {
        .flags = SPI_TRANS_USE_TXDATA | SPI_TRANS_USE_RXDATA,
        .length = 16,
    };
    t.tx_data[0] = (uint8_t)(((reg << 1) & 0x7E) | 0x80);
    t.tx_data[1] = 0x00;
    esp_err_t ret = spi_device_transmit(rc522_spi, &t);
    if (ret == ESP_OK) {
        *value = t.rx_data[1];
    }
    return ret;
}

static esp_err_t rc522_set_bitmask(uint8_t reg, uint8_t mask) {
    uint8_t value;
    ESP_ERROR_CHECK(rc522_read_reg(reg, &value));
    return rc522_write_reg(reg, value | mask);
}

static esp_err_t rc522_clear_bitmask(uint8_t reg, uint8_t mask) {
    uint8_t value;
    ESP_ERROR_CHECK(rc522_read_reg(reg, &value));
    return rc522_write_reg(reg, value & (uint8_t)(~mask));
}

static esp_err_t rc522_calculate_crc(const uint8_t *data, size_t length, uint8_t *result) {
    ESP_ERROR_CHECK(rc522_clear_bitmask(RC522_REG_DIV_IRQ, 0x04));
    ESP_ERROR_CHECK(rc522_set_bitmask(RC522_REG_FIFO_LEVEL, 0x80));

    for (size_t i = 0; i < length; i++) {
        ESP_ERROR_CHECK(rc522_write_reg(RC522_REG_FIFO_DATA, data[i]));
    }

    ESP_ERROR_CHECK(rc522_write_reg(RC522_REG_COMMAND, RC522_CMD_CALC_CRC));

    int i = 0xFF;
    uint8_t n = 0;
    do {
        ESP_ERROR_CHECK(rc522_read_reg(RC522_REG_DIV_IRQ, &n));
        i--;
    } while (i != 0 && !(n & 0x04));

    if (i == 0) {
        return ESP_ERR_TIMEOUT;
    }

    ESP_ERROR_CHECK(rc522_read_reg(RC522_REG_CRC_RESULT_L, &result[0]));
    ESP_ERROR_CHECK(rc522_read_reg(RC522_REG_CRC_RESULT_H, &result[1]));
    return ESP_OK;
}

static esp_err_t rc522_transceive(const uint8_t *send_data,
                                  size_t send_len,
                                  uint8_t *back_data,
                                  size_t *back_bits) {
    ESP_ERROR_CHECK(rc522_write_reg(RC522_REG_COMM_IE, 0x77 | 0x80));
    ESP_ERROR_CHECK(rc522_clear_bitmask(RC522_REG_COMM_IRQ, 0x80));
    ESP_ERROR_CHECK(rc522_set_bitmask(RC522_REG_FIFO_LEVEL, 0x80));
    ESP_ERROR_CHECK(rc522_write_reg(RC522_REG_COMMAND, RC522_CMD_IDLE));

    for (size_t i = 0; i < send_len; i++) {
        ESP_ERROR_CHECK(rc522_write_reg(RC522_REG_FIFO_DATA, send_data[i]));
    }

    ESP_ERROR_CHECK(rc522_write_reg(RC522_REG_COMMAND, RC522_CMD_TRANSCEIVE));
    ESP_ERROR_CHECK(rc522_set_bitmask(RC522_REG_BIT_FRAMING, 0x80));

    int iterations = 2000;
    uint8_t irq_status = 0;
    do {
        ESP_ERROR_CHECK(rc522_read_reg(RC522_REG_COMM_IRQ, &irq_status));
        iterations--;
    } while (iterations && !(irq_status & 0x01) && !(irq_status & 0x30));

    ESP_ERROR_CHECK(rc522_clear_bitmask(RC522_REG_BIT_FRAMING, 0x80));

    if (iterations == 0) {
        return ESP_ERR_TIMEOUT;
    }

    uint8_t error = 0;
    ESP_ERROR_CHECK(rc522_read_reg(RC522_REG_ERROR, &error));
    if (error & 0x1B) {
        return ESP_FAIL;
    }

    if (back_data && back_bits) {
        uint8_t length = 0;
        uint8_t last_bits = 0;
        ESP_ERROR_CHECK(rc522_read_reg(RC522_REG_FIFO_LEVEL, &length));
        ESP_ERROR_CHECK(rc522_read_reg(RC522_REG_CONTROL, &last_bits));
        last_bits &= 0x07;

        if (last_bits != 0) {
            *back_bits = (size_t)((length - 1) * 8 + last_bits);
        } else {
            *back_bits = (size_t)(length * 8);
        }

        for (uint8_t i = 0; i < length && i < MFRC522_MAX_LEN; i++) {
            ESP_ERROR_CHECK(rc522_read_reg(RC522_REG_FIFO_DATA, &back_data[i]));
        }
    }

    return ESP_OK;
}

static esp_err_t rc522_request(uint8_t req_mode) {
    ESP_ERROR_CHECK(rc522_write_reg(RC522_REG_BIT_FRAMING, 0x07));
    uint8_t back_data[MFRC522_MAX_LEN] = {0};
    size_t back_bits = 0;
    esp_err_t err = rc522_transceive(&req_mode, 1, back_data, &back_bits);
    if (err != ESP_OK || back_bits != 0x10) {
        return ESP_FAIL;
    }
    return ESP_OK;
}

static esp_err_t rc522_anticoll(uint8_t *serial, size_t *serial_len) {
    uint8_t command[] = {PICC_ANTICOLL_CL1, 0x20};
    uint8_t back_data[MFRC522_MAX_LEN] = {0};
    size_t back_bits = 0;

    ESP_ERROR_CHECK(rc522_write_reg(RC522_REG_BIT_FRAMING, 0x00));

    esp_err_t err = rc522_transceive(command, sizeof(command), back_data, &back_bits);
    if (err != ESP_OK) {
        return err;
    }

    if (back_bits != 0x28) {
        return ESP_FAIL;
    }

    uint8_t check = 0;
    for (int i = 0; i < 4; i++) {
        serial[i] = back_data[i];
        check ^= back_data[i];
    }

    if (check != back_data[4]) {
        return ESP_FAIL;
    }

    serial[4] = back_data[4];
    if (serial_len) {
        *serial_len = 5;
    }
    return ESP_OK;
}

static esp_err_t rc522_halt(void) {
    uint8_t buffer[4] = {0x50, 0x00, 0x00, 0x00};
    uint8_t crc[2] = {0};
    esp_err_t err = rc522_calculate_crc(buffer, 2, crc);
    if (err != ESP_OK) {
        return err;
    }
    buffer[2] = crc[0];
    buffer[3] = crc[1];
    // We ignore the response; just fire-and-forget.
    return rc522_transceive(buffer, sizeof(buffer), NULL, NULL);
}

static bool rc522_get_tag(uint8_t *uid, size_t *uid_len) {
    static uint32_t request_failures = 0;
    static uint32_t anticoll_failures = 0;

    if (!rc522_initialized) {
        return false;
    }

    esp_err_t req_err = rc522_request(PICC_REQIDL);
    if (req_err != ESP_OK) {
        request_failures++;
        if (request_failures % 20 == 1) {
            ESP_LOGW(TAG, "RFID request failed (%s). Check wiring/power. Failure count=%" PRIu32,
                     esp_err_to_name(req_err), request_failures);
        }
        return false;
    }

    size_t serial_length = 0;
    esp_err_t anticoll_err = rc522_anticoll(uid, &serial_length);
    if (anticoll_err != ESP_OK) {
        anticoll_failures++;
        if (anticoll_failures % 20 == 1) {
            ESP_LOGW(TAG, "RFID anticollision failed (%s). Failure count=%" PRIu32,
                     esp_err_to_name(anticoll_err), anticoll_failures);
        }
        return false;
    }

    rc522_halt();

    if (uid_len) {
        *uid_len = serial_length;
    }
    return true;
}

static esp_err_t rc522_antenna_on(void) {
    uint8_t value;
    ESP_ERROR_CHECK(rc522_read_reg(RC522_REG_TX_CONTROL, &value));
    if (!(value & 0x03)) {
        ESP_ERROR_CHECK(rc522_set_bitmask(RC522_REG_TX_CONTROL, 0x03));
    }
    ESP_ERROR_CHECK(rc522_write_reg(RC522_REG_RFCFG, 0x60));
    return ESP_OK;
}

static esp_err_t rc522_reset_sequence(void) {
    gpio_config_t rst_conf = {
        .pin_bit_mask = 1ULL << RC522_RST_PIN,
        .mode = GPIO_MODE_OUTPUT,
        .pull_down_en = 0,
        .pull_up_en = 0,
        .intr_type = GPIO_INTR_DISABLE,
    };
    ESP_ERROR_CHECK(gpio_config(&rst_conf));

    gpio_set_level(RC522_RST_PIN, 0);
    vTaskDelay(pdMS_TO_TICKS(10));
    gpio_set_level(RC522_RST_PIN, 1);
    vTaskDelay(pdMS_TO_TICKS(10));

    ESP_ERROR_CHECK(rc522_write_reg(RC522_REG_COMMAND, RC522_CMD_SOFT_RESET));
    vTaskDelay(pdMS_TO_TICKS(50));
    return ESP_OK;
}

static esp_err_t rc522_configure(void) {
    ESP_ERROR_CHECK(rc522_write_reg(RC522_REG_T_MODE, 0x8D));
    ESP_ERROR_CHECK(rc522_write_reg(RC522_REG_T_PRESCALER, 0x3E));
    ESP_ERROR_CHECK(rc522_write_reg(RC522_REG_T_RELOAD_L, 30));
    ESP_ERROR_CHECK(rc522_write_reg(RC522_REG_T_RELOAD_H, 0));
    ESP_ERROR_CHECK(rc522_write_reg(RC522_REG_TX_ASK, 0x40));
    ESP_ERROR_CHECK(rc522_write_reg(RC522_REG_MODE, 0x3D));
    return rc522_antenna_on();
}

static esp_err_t rc522_init(void) {
    if (rc522_initialized) {
        return ESP_OK;
    }

    spi_bus_config_t buscfg = {
        .mosi_io_num = RC522_MOSI_PIN,
        .miso_io_num = RC522_MISO_PIN,
        .sclk_io_num = RC522_SCK_PIN,
        .quadwp_io_num = -1,
        .quadhd_io_num = -1,
        .max_transfer_sz = 0,
        .flags = 0,
    };

    esp_err_t ret = spi_bus_initialize(RC522_SPI_HOST, &buscfg, SPI_DMA_CH_AUTO);
    if (ret != ESP_OK && ret != ESP_ERR_INVALID_STATE) {
        return ret;
    }

    spi_device_interface_config_t devcfg = {
        .clock_speed_hz = 5 * 1000 * 1000,
        .mode = 0,
        .spics_io_num = RC522_SDA_PIN,
        .queue_size = 1,
        .flags = 0, // full-duplex transactions (required for register reads)
    };

    ret = spi_bus_add_device(RC522_SPI_HOST, &devcfg, &rc522_spi);
    if (ret != ESP_OK) {
        return ret;
    }

    ESP_ERROR_CHECK(rc522_reset_sequence());
    ESP_ERROR_CHECK(rc522_configure());

    uint8_t version = 0;
    esp_err_t version_err = rc522_read_reg(RC522_REG_VERSION, &version);
    if (version_err != ESP_OK) {
        ESP_LOGE(TAG, "Failed to read MFRC522 version register: %s", esp_err_to_name(version_err));
        return version_err;
    }

    ESP_LOGI(TAG, "MFRC522 version register: 0x%02X", version);
    if (version == 0x00 || version == 0xFF) {
        ESP_LOGE(TAG, "Invalid MFRC522 version response. Expected 0x90/0x91/0x92. Check SPI wiring (SCK/MOSI/MISO/SDA) and power.");
        return ESP_FAIL;
    }

    rc522_initialized = true;
    ESP_LOGI(TAG, "MFRC522 ready (direct SPI mode)");
    return ESP_OK;
}

static void rfid_reader_task(void *pvParameters) {
    ESP_LOGI(TAG, "RFID reader task started");

    while (1) {
        uint8_t uid[MFRC522_MAX_LEN] = {0};
        size_t uid_len = 0;

        if (rc522_get_tag(uid, &uid_len)) {
            char uid_hex[32] = {0};
            for (size_t i = 0; i < uid_len && (i * 2 + 1) < sizeof(uid_hex); i++) {
                snprintf(&uid_hex[i * 2], sizeof(uid_hex) - (i * 2), "%02X", uid[i]);
            }

            ESP_LOGI(TAG, "@#@#@#@#@#@#@#@#@#@#@#@#@#@#@#@#@#@#@#");
            ESP_LOGI(TAG, "RFID CARD DETECTED!");
            ESP_LOGI(TAG, "UID: %s", uid_hex);
            ESP_LOGI(TAG, "Passing to gateway"...");
            ESP_LOGI(TAG, "@#@#@#@#@#@#@#@#@#@#@#@#@#@#@#@#@#@#@#");
            rfid_cache_entry_t *cache_entry = rfid_cache_get(uid_hex);
            if (cache_entry->name[0] == '\0') {
                if (fetch_student_info(uid_hex, cache_entry) != ESP_OK) {
                    strncpy(cache_entry->name, uid_hex, sizeof(cache_entry->name) - 1);
                    cache_entry->name[sizeof(cache_entry->name) - 1] = '\0';
                    strcpy(cache_entry->next_event, "entry");
                }
            }

            bool is_entry = strcasecmp(cache_entry->next_event, "exit") != 0;
            send_event_to_gateway(uid_hex);
            oled_show_event(cache_entry->name[0] ? cache_entry->name : uid_hex, is_entry);
            strcpy(cache_entry->next_event, is_entry ? "exit" : "entry");
            vTaskDelay(pdMS_TO_TICKS(1000));
        } else {
            vTaskDelay(pdMS_TO_TICKS(125));
        }
    }
}

void app_main(void) {
    ESP_LOGI(TAG, "Attendance Sys starting...");

    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        ret = nvs_flash_init();
    }
    ESP_ERROR_CHECK(ret);

    init_oled_display();

    wifi_init();

    vTaskDelay(pdMS_TO_TICKS(2000));

    esp_err_t rfid_err = rc522_init();
    if (rfid_err != ESP_OK) {
        ESP_LOGE(TAG, "UHOH, Failed to init MFRC522: %s", esp_err_to_name(rfid_err));
    }

    xTaskCreate(rfid_reader_task, "rfid_task", 4096, NULL, 5, NULL);

    ESP_LOGI(TAG, "System UP");
}

