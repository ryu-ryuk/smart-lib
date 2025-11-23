#ifndef CONFIG_H
#define CONFIG_H

// WiFi Configuration
#define WIFI_SSID "REPLACE_WITH_WIFI_SSID"
#define WIFI_PASSWORD "REPLACE_WITH_WIFI_PASSWORD"

// Gateway Configuration (use local network address)
// IMPORTANT: Must include http:// or https://
// Using your local IP address (ESP32 can't resolve localhost)
#define GATEWAY_URL "https://esp.alokranjan.me"
#define ADMIN_API_URL "https://esp.alokranjan.me/admin"

#define DEVICE_TOKEN "dev-esp32-123"     // Plain token whose SHA-256 hash is stored in DB
#define DEVICE_ID "esp32-device-009"

// MFRC522 RFID Reader Configuration
#define RC522_SPI_HOST SPI2_HOST  // Use HSPI (ShowPI2) - GPIO 18, 19, 23
#define RC522_MISO_PIN 19  // RC522 MISO -> ESP32 GPIO19 (D19)
#define RC522_MOSI_PIN 23  // RC522 MOSI -> ESP32 GPIO23 (D23)
#define RC522_SCK_PIN 18   // RC522 SCK  -> ESP32 GPIO18 (D18)
#define RC522_SDA_PIN 5    // RC522 SDA/SS -> ESP32 GPIO5 (D5)
#define RC522_RST_PIN 4    // RC522 RST -> ESP32 GPIO4 (D4)

// OLED Display (SSD1306 over I2C)
#define OLED_SDA_PIN 21
#define OLED_SCL_PIN 22
#define OLED_I2C_ADDR 0x3C
#define OLED_I2C_PORT 0

#endif // CONFIG_H

