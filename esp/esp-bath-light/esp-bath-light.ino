#include <ESP8266WiFi.h>
#include <ESP8266WebServer.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// ---------------- Константи ----------------

// Wi-Fi
#define WIFI_SSID "YOUR_SSID"
#define WIFI_PASS "YOUR_PASSWORD"

#define WIFI_SSID_BACKUP "YOUR_PHONE_HOTSPOT"
#define WIFI_PASS_BACKUP "YOUR_PHONE_PASSWORD"

const char* DEVICE_ID   = "esp-light-bathroom";
const char* DEVICE_NAME = "ESP Light Bathroom";

// OLED
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET    -1
#define SCREEN_ADDRESS 0x3C
#define OLED_SDA 14        // D5 / GPIO14
#define OLED_SCL 12        // D6 / GPIO12

// Датчик світла (LM393 DO)
#define LIGHT_PIN 0        // D3 / GPIO0

const bool LIGHT_ACTIVE_LOW = true;

// Інтервали
const unsigned long LIGHT_POLL_INTERVAL_MS   = 100;
const unsigned long LIGHT_DEBOUNCE_MS        = 200;
const unsigned long DISPLAY_INTERVAL_MS      = 500;
const unsigned long WIFI_CONNECT_TIMEOUT_MS  = 15000;

// ---------------- Структура стану освітлення ----------------

struct LightState {
  bool isOn;
  bool hasValue;
  unsigned long lastChangeMs;
};

LightState lightState = {
  false,
  false,
  0
};

bool lastRawOn = false;
unsigned long lastRawChangeMs = 0;
unsigned long lastPollMs = 0;

// ---------------- Глобальні об'єкти ----------------

ESP8266WebServer server(80);
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

bool wifiConnected = false;
unsigned long lastDisplayUpdateMs = 0;

// ---------------- Прототипи ----------------

void setupWifi();
void setupHardware();
void setupHttpServer();

void updateLightState();
void updateDisplay();
void handleInfoRequest();

// ---------------- SETUP ----------------

void setup() {
  Serial.begin(115200);

  setupWifi();
  setupHardware();
  setupHttpServer();

  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.println(DEVICE_NAME);
  display.setCursor(0, 16);
  display.print("WiFi: ");
  display.println(wifiConnected ? "online" : "offline");
  display.setCursor(0, 28);
  display.print("IP: ");
  display.println(WiFi.localIP());
  display.setCursor(0, 40);
  display.print("Sensor: LM393");
  display.display();

  delay(1500);

  updateLightState();
  lastDisplayUpdateMs = millis();
}

// ---------------- LOOP ----------------

void loop() {
  server.handleClient();

  unsigned long now = millis();

  updateLightState();

  if (now - lastDisplayUpdateMs >= DISPLAY_INTERVAL_MS) {
    lastDisplayUpdateMs = now;
    updateDisplay();
  }
}

// ---------------- Wi-Fi ----------------

void setupWifi() {
  WiFi.mode(WIFI_STA);
  
  // Спроба підключення до основного WiFi
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  unsigned long start = millis();
  
  while (WiFi.status() != WL_CONNECTED &&
         millis() - start < WIFI_CONNECT_TIMEOUT_MS) {
    delay(250);
  }
  
  // Якщо основний WiFi не підключився - пробуємо резервний
  if (WiFi.status() != WL_CONNECTED) {
    WiFi.begin(WIFI_SSID_BACKUP, WIFI_PASS_BACKUP);
    start = millis();
    
    while (WiFi.status() != WL_CONNECTED &&
           millis() - start < WIFI_CONNECT_TIMEOUT_MS) {
      delay(250);
    }
  }

  wifiConnected = (WiFi.status() == WL_CONNECTED);
}

// ---------------- Дисплей + датчик ----------------

void setupHardware() {
  pinMode(LIGHT_PIN, INPUT);

  Wire.begin(OLED_SDA, OLED_SCL);
  if (!display.begin(SSD1306_SWITCHCAPVCC, SCREEN_ADDRESS)) {
    while (true) {}
  }
}

// ---------------- HTTP ----------------

void setupHttpServer() {
  server.on("/ceronest/info", HTTP_GET, handleInfoRequest);
  server.begin();
}

// -------------- Оновлення стану світла --------------

void updateLightState() {
  unsigned long now = millis();

  if (now - lastPollMs < LIGHT_POLL_INTERVAL_MS) {
    return;
  }
  lastPollMs = now;

  int rawLevel = digitalRead(LIGHT_PIN);
  bool rawOn;

  if (LIGHT_ACTIVE_LOW) {
    rawOn = (rawLevel == LOW);
  } else {
    rawOn = (rawLevel == HIGH);
  }

  if (rawOn != lastRawOn) {
    lastRawOn = rawOn;
    lastRawChangeMs = now;
  }

  if (!lightState.hasValue) {
    if (now - lastRawChangeMs >= LIGHT_DEBOUNCE_MS) {
      lightState.isOn = rawOn;
      lightState.hasValue = true;
      lightState.lastChangeMs = now;
    }
    return;
  }

  if (rawOn != lightState.isOn &&
      now - lastRawChangeMs >= LIGHT_DEBOUNCE_MS) {
    lightState.isOn = rawOn;
    lightState.lastChangeMs = now;
  }
}

// ---------------- OLED ----------------

void updateDisplay() {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);

  display.setTextSize(1);
  display.setCursor(0, 0);
  display.println(DEVICE_NAME);

  display.setTextSize(2);
  display.setCursor(0, 18);
  display.print("Light: ");
  if (lightState.hasValue) {
    display.println(lightState.isOn ? "ON" : "OFF");
  } else {
    display.println("--");
  }

  display.setTextSize(1);
  display.setCursor(0, 46);
  if (wifiConnected) {
    display.print("IP: ");
    display.print(WiFi.localIP());
  } else {
    display.print("WiFi: offline");
  }

  display.display();
}

// ---------------- /ceronest/info ----------------

void handleInfoRequest() {
  int lightValue = 0;
  if (lightState.hasValue) {
    lightValue = lightState.isOn ? 1 : 0;
  } else {
    lightValue = 0;
  }

  String json = "{";

  json += "\"id\":\"";
  json += DEVICE_ID;
  json += "\",";
  json += "\"name\":\"";
  json += DEVICE_NAME;
  json += "\",";
  json += "\"sensors\":{";
  json += "\"light\":";
  json += String(lightValue);
  json += "}";

  json += "}";

  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.send(200, "application/json; charset=utf-8", json);
}