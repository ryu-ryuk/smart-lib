#ifndef CONFIG_H
#define CONFIG_H

// WiFi Configuration
// REPLACE WITH YOUR ACTUAL WIFI CREDENTIALS
#define WIFI_SSID "YourActualWiFiName"          // Replace with your WiFi name
#define WIFI_PASSWORD "YourActualPassword"      // Replace with your WiFi password

// Gateway Configuration
// Gateway & Admin API (served via Cloudflare)
#define GATEWAY_URL "https://esp.alokranjan.me"
#define ADMIN_API_URL "https://esp.alokranjan.me/admin"

// Device Authentication
#define DEVICE_TOKEN "REPLACE_WITH_DEVICE_TOKEN"  // Plain token whose SHA-256 hash lives in DB
#define DEVICE_ID "esp32-device-001"              // Unique device ID

#endif // CONFIG_H

