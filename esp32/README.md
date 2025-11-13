# ESP32 Setup Guide for Arch Linux

## Quick Setup

1. **Install ESP-IDF** (Espressif IoT Development Framework):
```bash
# Install required packages
sudo pacman -S git wget flex bison gperf python python-pip cmake ninja ccache dfu-util libusb

# Create esp directory
mkdir -p ~/esp
cd ~/esp

# Clone ESP-IDF
git clone --recursive https://github.com/espressif/esp-idf.git
cd esp-idf
./install.sh esp32

# Add to your shell profile (~/.zshrc)
echo '. $HOME/esp/esp-idf/export.sh' >> ~/.zshrc
source ~/.zshrc
```

2. **Verify installation**:
```bash
idf.py --version
```

3. **Set up permissions** (if needed):
```bash
sudo usermod -a -G dialout $USER
# Log out and back in for this to take effect
```

## Building and Flashing

**Important:** Make sure you're in the `dialout` group:
```bash
sudo usermod -a -G dialout $USER
# Then log out and back in, or run: newgrp dialout
```

**Build and flash:**
```bash
cd /home/ryu/Downloads/sm/esp32
idf.py set-target esp32  # First time only
idf.py -p /dev/ttyUSB0 flash monitor
```

**Note:** `idf.py` requires a command. Use:
- `flash` - Flash firmware
- `monitor` - View serial output
- `flash monitor` - Flash and monitor
- `build` - Build only

## Configuration

Edit `main/include/config.h` to set:
- `WIFI_SSID` - Your WiFi network name
- `WIFI_PASSWORD` - Your WiFi password  
- `GATEWAY_URL` - Your backend server URL (e.g., `https://your-server.com`)
- `DEVICE_TOKEN` - Device authentication token (get from backend admin)
- `DEVICE_ID` - Unique device identifier

## Hardware Requirements

- ESP32 development board
- RC522 RFID reader module
- Jumper wires

Wiring:
- RC522 SDA → ESP32 GPIO 5
- RC522 SCK → ESP32 GPIO 18
- RC522 MOSI → ESP32 GPIO 23
- RC522 MISO → ESP32 GPIO 19
- RC522 RST → ESP32 GPIO 4
- RC522 3.3V → ESP32 3.3V
- RC522 GND → ESP32 GND

