// Simple pin test program to help identify GPIO pins
// This will blink GPIO pins to help you identify them

#include "driver/gpio.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_log.h"

static const char *TAG = "PIN_TEST";

void app_main(void) {
    ESP_LOGI(TAG, "Pin Test Program");
    ESP_LOGI(TAG, "This will help identify GPIO pins");
    ESP_LOGI(TAG, "");
    ESP_LOGI(TAG, "Connect LED to each pin to see which one blinks");
    ESP_LOGI(TAG, "");
    ESP_LOGI(TAG, "Testing GPIO pins: 4, 5, 18, 19, 23");
    
    // Configure pins as outputs
    gpio_set_direction(4, GPIO_MODE_OUTPUT);
    gpio_set_direction(5, GPIO_MODE_OUTPUT);
    gpio_set_direction(18, GPIO_MODE_OUTPUT);
    gpio_set_direction(19, GPIO_MODE_OUTPUT);
    gpio_set_direction(23, GPIO_MODE_OUTPUT);
    
    int pins[] = {4, 5, 18, 19, 23};
    const char* pin_names[] = {"GPIO 4 (RST)", "GPIO 5 (SDA)", "GPIO 18 (SCK)", "GPIO 19 (MISO)", "GPIO 23 (MOSI)"};
    
    while (1) {
        for (int i = 0; i < 5; i++) {
            ESP_LOGI(TAG, "Blinking %s", pin_names[i]);
            gpio_set_level(pins[i], 1);
            vTaskDelay(pdMS_TO_TICKS(1000));
            gpio_set_level(pins[i], 0);
            vTaskDelay(pdMS_TO_TICKS(500));
        }
    }
}

