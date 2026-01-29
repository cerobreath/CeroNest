#include <ESP8266WiFi.h>
#include <ESP8266WebServer.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <Adafruit_BMP085.h>
#include <DHT.h>
#include <math.h>

// ============================================================================
// CONFIGURATION
// ============================================================================

// WiFi credentials
#define WIFI_SSID "YOUR_SSID"
#define WIFI_PASS "YOUR_PASSWORD"

#define WIFI_SSID_BACKUP "YOUR_PHONE_HOTSPOT"
#define WIFI_PASS_BACKUP "YOUR_PHONE_PASSWORD"

// Device identification
const char* DEVICE_ID   = "esp-climate-room";
const char* DEVICE_NAME = "ESP Climate Room";

// OLED display pins and settings
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1
#define SCREEN_ADDRESS 0x3C
#define OLED_SDA 14  // D5 / GPIO14
#define OLED_SCL 12  // D6 / GPIO12

// DHT11 sensor
#define DHTPIN 5     // D1 / GPIO5
#define DHTTYPE DHT11

// Timing intervals
const unsigned long MEASURE_INTERVAL_MS      = 5000;   // Sensor reading interval
const unsigned long DHT_MIN_INTERVAL_MS      = 2000;   // Minimum DHT reading interval
const unsigned long DISPLAY_INTERVAL_MS      = 1000;   // Display update interval
const unsigned long WIFI_CONNECT_TIMEOUT_MS  = 10000;  // WiFi connection timeout
const unsigned long WIFI_RECONNECT_INTERVAL_MS = 30000; // WiFi reconnection check interval

// Altitude and pressure calibration
const float CHERNIHIV_ALTITUDE_M = 150.0f;
const float PRESSURE_CALIBRATION_HPA = 0.0f;

// ============================================================================
// GLOBAL STATE
// ============================================================================

// Sensor measurements
struct Measurements {
  float temperature;
  float humidity;
  float pressure;
  unsigned long lastUpdateMs;
  bool hasTemperature;
  bool hasHumidity;
  bool hasPressure;
};

Measurements measurements = {0.0f, 0.0f, 0.0f, 0, false, false, false};

// Sensor state
bool bmpOk = false;
bool sensorsEnabled = false;

// Timers
unsigned long lastMeasureMs = 0;
unsigned long lastDhtReadMs = 0;
unsigned long lastDisplayUpdateMs = 0;

// WiFi state
unsigned long lastWifiCheckMs = 0;
bool wifiCheckInProgress = false;
bool wifiConnected = false;

// Global objects
ESP8266WebServer server(80);
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);
Adafruit_BMP085 bmp;
DHT dht(DHTPIN, DHTTYPE);

// ============================================================================
// FUNCTION DECLARATIONS
// ============================================================================

void setupWifi();
void setupHardware();
void setupHttpServer();
void updateMeasurements();
void readDht();
void readBmp();
void updateDisplay();
void handleInfoRequest();
void checkWifiConnection();
void reconnectWifi();
void enableSensors();

// ============================================================================
// SETUP
// ============================================================================

void setup() {
  // Initialize hardware (pins and OLED only, no sensor reading yet)
  setupHardware();

  // Show startup message
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.println(DEVICE_NAME);
  display.setCursor(0, 20);
  display.println("Connecting WiFi...");
  display.display();

  // Connect to WiFi (highest power consumption - everything else is off)
  setupWifi();
  setupHttpServer();

  // Show connection result
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.println(DEVICE_NAME);
  display.setCursor(0, 16);
  display.print("WiFi: ");
  display.println(wifiConnected ? "online" : "local");
  if (wifiConnected) {
    display.setCursor(0, 28);
    display.print("IP: ");
    display.println(WiFi.localIP());
  }
  display.setCursor(0, 40);
  display.println("Starting sensors...");
  display.display();

  delay(500);

  // Enable sensors (after WiFi)
  enableSensors();

  // Show ready screen with sensor status
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.println(DEVICE_NAME);
  display.setCursor(0, 16);
  display.print("WiFi: ");
  display.println(wifiConnected ? "online" : "local");
  if (wifiConnected) {
    display.setCursor(0, 28);
    display.print("IP: ");
    display.println(WiFi.localIP());
  }
  display.setCursor(0, 40);
  display.print("BMP180: ");
  display.println(bmpOk ? "OK" : "ERROR");
  display.setCursor(0, 52);
  display.println("Ready!");
  display.display();

  delay(1000);

  lastMeasureMs = millis();
  lastWifiCheckMs = millis();
}

// ============================================================================
// MAIN LOOP
// ============================================================================

void loop() {
  // Handle HTTP requests if connected
  if (wifiConnected) {
    server.handleClient();
  }

  unsigned long now = millis();

  // Update components
  if (sensorsEnabled && now - lastMeasureMs >= MEASURE_INTERVAL_MS) {
    lastMeasureMs = now;
    updateMeasurements();
  }

  if (now - lastDisplayUpdateMs >= DISPLAY_INTERVAL_MS) {
    lastDisplayUpdateMs = now;
    updateDisplay();
  }

  checkWifiConnection();
}

// ============================================================================
// WIFI FUNCTIONS
// ============================================================================

void setupWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.setSleepMode(WIFI_MODEM_SLEEP);

  // Try primary network
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  unsigned long start = millis();

  while (WiFi.status() != WL_CONNECTED &&
         millis() - start < WIFI_CONNECT_TIMEOUT_MS) {
    delay(100);
  }

  // Try backup network if primary failed
  if (WiFi.status() != WL_CONNECTED) {
    WiFi.begin(WIFI_SSID_BACKUP, WIFI_PASS_BACKUP);
    start = millis();

    while (WiFi.status() != WL_CONNECTED &&
           millis() - start < WIFI_CONNECT_TIMEOUT_MS) {
      delay(100);
    }
  }

  wifiConnected = (WiFi.status() == WL_CONNECTED);

  // If connection failed, enter local mode
  if (!wifiConnected) {
    WiFi.mode(WIFI_OFF);
    WiFi.forceSleepBegin();
    delay(1);
  }
}

void checkWifiConnection() {
  unsigned long now = millis();

  // Check every 30 seconds
  if (now - lastWifiCheckMs < WIFI_RECONNECT_INTERVAL_MS) {
    return;
  }

  lastWifiCheckMs = now;

  // If connected, verify connection status
  if (wifiConnected) {
    if (WiFi.status() != WL_CONNECTED) {
      wifiConnected = false;
      reconnectWifi();
    }
  } else {
    // If not connected, try to reconnect
    reconnectWifi();
  }
}

void reconnectWifi() {
  if (wifiCheckInProgress) return;

  wifiCheckInProgress = true;

  // Wake from sleep mode
  WiFi.forceSleepWake();
  delay(1);
  WiFi.mode(WIFI_STA);

  // Try primary network
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  unsigned long start = millis();

  while (WiFi.status() != WL_CONNECTED &&
         millis() - start < WIFI_CONNECT_TIMEOUT_MS) {
    delay(100);
  }

  // Try backup network if primary failed
  if (WiFi.status() != WL_CONNECTED) {
    WiFi.begin(WIFI_SSID_BACKUP, WIFI_PASS_BACKUP);
    start = millis();

    while (WiFi.status() != WL_CONNECTED &&
           millis() - start < WIFI_CONNECT_TIMEOUT_MS) {
      delay(100);
    }
  }

  bool newStatus = (WiFi.status() == WL_CONNECTED);

  if (newStatus != wifiConnected) {
    wifiConnected = newStatus;

    if (wifiConnected) {
      setupHttpServer();
    } else {
      WiFi.mode(WIFI_OFF);
      WiFi.forceSleepBegin();
      delay(1);
    }
  }

  wifiCheckInProgress = false;
}

// ============================================================================
// HARDWARE INITIALIZATION
// ============================================================================

void setupHardware() {
  // Initialize OLED
  Wire.begin(OLED_SDA, OLED_SCL);
  if (!display.begin(SSD1306_SWITCHCAPVCC, SCREEN_ADDRESS)) {
    while (true) {}  // Halt if display initialization fails
  }

  // Sensors are disabled until after WiFi connection
  sensorsEnabled = false;
}

void enableSensors() {
  // Initialize DHT sensor
  dht.begin();

  // Initialize BMP180 sensor
  if (!bmp.begin()) {
    bmpOk = false;
  } else {
    bmpOk = true;
  }

  sensorsEnabled = true;

  // Perform first measurement
  updateMeasurements();

  // Allow time to stabilize
  delay(100);
}

// ============================================================================
// HTTP SERVER
// ============================================================================

void setupHttpServer() {
  if (wifiConnected) {
    server.on("/ceronest/info", HTTP_GET, handleInfoRequest);
    server.begin();
  }
}

void handleInfoRequest() {
  if (!wifiConnected) return;

  String json = "{";
  json += "\"id\":\"" + String(DEVICE_ID) + "\",";
  json += "\"name\":\"" + String(DEVICE_NAME) + "\",";
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

  json += "}}";

  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.send(200, "application/json; charset=utf-8", json);
}

// ============================================================================
// SENSOR MEASUREMENTS
// ============================================================================

void updateMeasurements() {
  if (!sensorsEnabled) return;

  readDht();
  readBmp();
  measurements.lastUpdateMs = millis();
}

void readDht() {
  unsigned long now = millis();

  // Respect minimum DHT reading interval
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

  // Read raw local pressure (Pa → hPa)
  long pPa = bmp.readPressure();
  float pLocal_hPa = pPa / 100.0f;

  // Valid range for indoor barometer: 800-1100 hPa
  if (isnan(pLocal_hPa) || pLocal_hPa < 800.0f || pLocal_hPa > 1100.0f) {
    measurements.hasPressure = false;
    return;
  }

  // Convert to sea level pressure (Chernihiv altitude + floor)
  // P0 = P / (1 - h/44330)^5.255
  float factor = pow(1.0f - (CHERNIHIV_ALTITUDE_M / 44330.0f), 5.255f);
  float pSea_hPa = pLocal_hPa / factor;

  // Apply fine calibration
  pSea_hPa += PRESSURE_CALIBRATION_HPA;

  // Validate sea level pressure
  if (pSea_hPa < 900.0f || pSea_hPa > 1100.0f) {
    measurements.hasPressure = false;
    return;
  }

  measurements.pressure = pSea_hPa;
  measurements.hasPressure = true;
}

// ============================================================================
// DISPLAY CONTROL
// ============================================================================

void updateDisplay() {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);

  // Device name
  display.setCursor(0, 0);
  display.println(DEVICE_NAME);

  // Temperature
  display.setCursor(0, 16);
  display.print("T: ");
  if (measurements.hasTemperature) {
    display.print(measurements.temperature, 1);
    display.print(" C");
  } else {
    display.print("--.- C");
  }

  // Humidity
  display.setCursor(0, 28);
  display.print("H: ");
  if (measurements.hasHumidity) {
    display.print(measurements.humidity, 1);
    display.print(" %");
  } else {
    display.print("--.- %");
  }

  // Pressure
  display.setCursor(0, 40);
  display.print("P: ");
  if (measurements.hasPressure) {
    float mmHg = measurements.pressure * 0.75006f;
    display.print(mmHg, 0);
    display.print(" mmHg");
  } else {
    display.print("---- mmHg");
  }

  // Network status
  display.setCursor(0, 52);
  if (wifiConnected) {
    display.print("IP: ");
    display.print(WiFi.localIP());
  } else {
    display.print("Mode: Local");
  }

  display.display();
}