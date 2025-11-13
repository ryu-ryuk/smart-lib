-- init.lua
-- Usage: upload this file together with rfid.lua to a NodeMCU Lua firmware build
-- (ESP32) and reboot the board. The script initializes the MFRC522 using the
-- rfid32 helper and prints detected tag UIDs.

local rfid_factory = assert(dofile("rfid.lua"), "rfid.lua not found")

-- Define the wiring that matches your breadboard setup.
local reader = rfid_factory({
  pin_sda  = 22, -- MFRC522 SDA -> ESP32 GPIO22
  pin_clk  = 19, -- MFRC522 SCK -> ESP32 GPIO19
  pin_miso = 25, -- MFRC522 MISO -> ESP32 GPIO25
  pin_mosi = 23, -- MFRC522 MOSI -> ESP32 GPIO23
})

reader.init()

print("RC522 ready, scanning...")

reader.scan({
  interval = 125,        -- poll interval while idle (ms)
  pause_interval = 1000, -- delay after each successful read (ms)
  got_tag = function(tag, rfid)
    local uid_hex = tag.hex()
    print("RFID detected:", uid_hex)
    -- Example: pause scanning if you want to process the tag
    -- rfid.scan_pause()
    -- process(uid_hex)
    -- rfid.scan_resume()
  end,
})

