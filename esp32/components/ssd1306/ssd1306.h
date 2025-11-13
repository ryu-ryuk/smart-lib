#pragma once

#include <stdbool.h>
#include <stdint.h>
#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    int i2c_port;
    int sda_io;
    int scl_io;
    uint32_t clk_speed_hz;
    uint8_t i2c_address;
} ssd1306_config_t;

esp_err_t ssd1306_init(const ssd1306_config_t *config);
void ssd1306_power_off(void);
void ssd1306_power_on(void);
void ssd1306_clear(void);
void ssd1306_draw_text(uint8_t line, uint8_t column, const char *text);
void ssd1306_draw_line(uint8_t page, uint8_t column, const uint8_t *data, size_t len);
void ssd1306_show_scanned_uid(const char *uid);

#ifdef __cplusplus
}
#endif

