#include <ESP8266WiFi.h>
#include <ESP8266WebServer.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <Adafruit_BMP085.h>
#include <DHT.h>
#include <math.h>

// ---------------- Константи ----------------

#define WIFI_SSID "YOUR_SSID"
#define WIFI_PASS "YOUR_PASSWORD"

#define WIFI_SSID_BACKUP "YOUR_PHONE_HOTSPOT"
#define WIFI_PASS_BACKUP "YOUR_PHONE_PASSWORD"

const char* DEVICE_ID   = "esp-climate-room";
const char* DEVICE_NAME = "ESP Climate Room";

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1
#define SCREEN_ADDRESS 0x3C
#define OLED_SDA 14        // D5 / GPIO14
#define OLED_SCL 12        // D6 / GPIO12

#define DHTPIN 5           // D1 / GPIO5
#define DHTTYPE DHT11

const unsigned long MEASURE_INTERVAL_MS      = 5000;
const unsigned long DHT_MIN_INTERVAL_MS      = 2000;
const unsigned long DISPLAY_INTERVAL_MS      = 1000;
const unsigned long WIFI_CONNECT_TIMEOUT_MS  = 15000;

const float CHERNIHIV_ALTITUDE_M = 150.0f;
const float PRESSURE_CALIBRATION_HPA = 0.0f;

// ---------------- Глобальні об'єкти ----------------

ESP8266WebServer server(80);
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);
Adafruit_BMP085 bmp;
DHT dht(DHTPIN, DHTTYPE);

bool wifiConnected = false;
bool bmpOk = false;

// ---------------- Структура вимірювань ----------------

struct Measurements {
  float temperature;
  float humidity;
  float pressure;
  unsigned long lastUpdateMs;
  bool hasTemperature;
  bool hasHumidity;
  bool hasPressure;
};

Measurements measurements = {
  0.0f, 0.0f, 0.0f, 0,
  false, false, false
};

// ---------------- Таймери ----------------

unsigned long lastMeasureMs       = 0;
unsigned long lastDhtReadMs       = 0;
unsigned long lastDisplayUpdateMs = 0;

// ---------------- Прототипи ----------------

void setupWifi();
void setupSensors();
void setupHttpServer();

void updateMeasurements();
void readDht();
void readBmp();

void updateDisplay();
void handleInfoRequest();

// ---------------- SETUP ----------------

void setup() {
  setupWifi();
  setupSensors();
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
  display.print("BMP180: ");
  display.println(bmpOk ? "OK" : "ERROR");
  display.display();

  delay(1500);

  updateMeasurements();
  lastMeasureMs = millis();
}

// ---------------- LOOP ----------------

void loop() {
  server.handleClient();

  unsigned long now = millis();

  if (now - lastMeasureMs >= MEASURE_INTERVAL_MS) {
    lastMeasureMs = now;
    updateMeasurements();
  }

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

// ---------------- Датчики та дисплей ----------------

void setupSensors() {
  dht.begin();

  Wire.begin(OLED_SDA, OLED_SCL);
  if (!display.begin(SSD1306_SWITCHCAPVCC, SCREEN_ADDRESS)) {
    while (true) {}
  }

  if (!bmp.begin()) {
    bmpOk = false;
    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);
    display.setTextSize(1);
    display.setCursor(0, 0);
    display.println("BMP180 error");
    display.display();
  } else {
    bmpOk = true;
  }
}

// ---------------- HTTP ----------------

void setupHttpServer() {
  server.on("/ceronest/info", HTTP_GET, handleInfoRequest);
  server.begin();
}

// ---------------- Оновлення вимірювань ----------------

void updateMeasurements() {
  readDht();
  readBmp();
  measurements.lastUpdateMs = millis();
}

void readDht() {
  unsigned long now = millis();
  if (now - lastDhtReadMs < DHT_MIN_INTERVAL_MS) {
    return;
  }
  lastDhtReadMs = now;

  float t = dht.readTemperature();
  float h = dht.readHumidity();

  if (!isnan(t)) {
    measurements.temperature = t;
    measurements.hasTemperature = true;
  }

  if (!isnan(h)) {
    measurements.humidity = h;
    measurements.hasHumidity = true;
  }
}

void readBmp() {
  if (!bmpOk) {
    measurements.hasPressure = false;
    return;
  }

  // Сирий локальний тиск (Па → hPa)
  long pPa = bmp.readPressure();
  float pLocal_hPa = pPa / 100.0f;

  // Фізично адекватний діапазон для кімнатного барометра:
  // 800–1100 hPa. Все, що поза – вважаємо помилкою
  if (isnan(pLocal_hPa) || pLocal_hPa < 800.0f || pLocal_hPa > 1100.0f) {
    measurements.hasPressure = false;
    return;
  }

  // Приведення до рівня моря (Чернігів + поверх)
  // P0 = P / (1 - h/44330)^5.255
  float factor = pow(1.0f - (CHERNIHIV_ALTITUDE_M / 44330.0f), 5.255f);
  float pSea_hPa = pLocal_hPa / factor;

  // Тонке калібрування (додавання ±кількох hPa)
  pSea_hPa += PRESSURE_CALIBRATION_HPA;

  // Ще одна перевірка
  if (pSea_hPa < 900.0f || pSea_hPa > 1100.0f) {
    measurements.hasPressure = false;
    return;
  }

  measurements.pressure   = pSea_hPa;
  measurements.hasPressure = true;
}

// ---------------- OLED ----------------

void updateDisplay() {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);

  display.setCursor(0, 0);
  display.println(DEVICE_NAME);

  display.setCursor(0, 16);
  display.print("T: ");
  if (measurements.hasTemperature) {
    display.print(measurements.temperature, 1);
    display.print(" C");
  } else {
    display.print("--.- C");
  }

  display.setCursor(0, 28);
  display.print("H: ");
  if (measurements.hasHumidity) {
    display.print(measurements.humidity, 1);
    display.print(" %");
  } else {
    display.print("--.- %");
  }

  display.setCursor(0, 40);
  display.print("P: ");
  if (measurements.hasPressure) {
    float mmHg = measurements.pressure * 0.75006f;
    display.print(mmHg, 0);
    display.print(" mmHg");
  } else {
    display.print("---- mmHg");
  }

  display.setCursor(0, 52);
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
  String json = "{";

  json += "\"id\":\"";
  json += DEVICE_ID;
  json += "\",";
  json += "\"name\":\"";
  json += DEVICE_NAME;
  json += "\",";
  json += "\"sensors\":{";

  json += "\"temperature\":";
  if (measurements.hasTemperature) {
    json += String(measurements.temperature, 1);
  } else {
    json += "null";
  }
  json += ",";

  json += "\"humidity\":";
  if (measurements.hasHumidity) {
    json += String(measurements.humidity, 1);
  } else {
    json += "null";
  }
  json += ",";

  json += "\"pressure\":";
  if (measurements.hasPressure) {
    float mmHg = measurements.pressure * 0.75006f;
    json += String(mmHg, 1);
  } else {
    json += "null";
  }

  json += "}";
  json += "}";

  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.send(200, "application/json; charset=utf-8", json);
}