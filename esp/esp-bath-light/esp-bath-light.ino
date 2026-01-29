#include <ESP8266WiFi.h>
#include <ESP8266WebServer.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// ============================================================================
// CONFIGURATION
// ============================================================================

// WiFi credentials
#define WIFI_SSID "YOUR_SSID"
#define WIFI_PASS "YOUR_PASSWORD"

#define WIFI_SSID_BACKUP "YOUR_PHONE_HOTSPOT"
#define WIFI_PASS_BACKUP "YOUR_PHONE_PASSWORD"

// Device identification
const char* DEVICE_ID   = "esp-light-bathroom";
const char* DEVICE_NAME = "ESP Light Bathroom";

// OLED display pins and settings
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET    -1
#define SCREEN_ADDRESS 0x3C
#define OLED_SDA 14  // D5 / GPIO14
#define OLED_SCL 12  // D6 / GPIO12

// Light sensor (LM393 Digital Output)
#define LIGHT_PIN 2  // D4 / GPIO2

// Buzzer
#define BUZZER_PIN 0  // D3 / GPIO0

// Light sensor logic
const bool LIGHT_ACTIVE_LOW = true;

// Timing intervals
const unsigned long LIGHT_POLL_INTERVAL_STABLE_MS = 500;   // Polling when stable
const unsigned long LIGHT_POLL_INTERVAL_ACTIVE_MS = 100;   // Polling when changing
const unsigned long LIGHT_DEBOUNCE_MS             = 200;   // Debounce time
const unsigned long DISPLAY_TIMEOUT_MS            = 15000; // Display auto-off timeout
const unsigned long WIFI_CONNECT_TIMEOUT_MS       = 10000; // WiFi connection timeout
const unsigned long WIFI_RECONNECT_INTERVAL_MS    = 30000; // WiFi reconnection check interval
const unsigned long BUZZER_DURATION_MS            = 2000;  // Buzzer duration on startup

// ============================================================================
// GLOBAL STATE
// ============================================================================

// Light sensor state
struct LightState {
  bool isOn;
  bool hasValue;
  unsigned long lastChangeMs;
};

LightState lightState = {false, false, 0};
bool lastRawOn = false;
unsigned long lastRawChangeMs = 0;
unsigned long lastPollMs = 0;
unsigned long currentPollInterval = LIGHT_POLL_INTERVAL_ACTIVE_MS;
bool lightSensorEnabled = false;

// Display state
bool displayActive = true;
unsigned long lastDisplayActionMs = 0;
bool displayNeedsUpdate = true;

// Buzzer state
unsigned long buzzerStartMs = 0;
bool buzzerActive = false;

// WiFi state
unsigned long lastWifiCheckMs = 0;
bool wifiCheckInProgress = false;
bool wifiConnected = false;

// Global objects
ESP8266WebServer server(80);
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// ============================================================================
// FUNCTION DECLARATIONS
// ============================================================================

void setupWifi();
void setupHardware();
void setupHttpServer();
void updateLightState();
void updateDisplay();
void handleInfoRequest();
void enableDisplay();
void disableDisplay();
void checkDisplayTimeout();
void startBuzzer();
void updateBuzzer();
void checkWifiConnection();
void reconnectWifi();
void enableLightSensor();

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

  // Enable light sensor (after WiFi)
  enableLightSensor();

  // Start buzzer (after everything else)
  startBuzzer();

  // Show ready screen
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
  display.println("Ready!");
  display.display();

  lastDisplayActionMs = millis();
  lastWifiCheckMs = millis();
}

// ============================================================================
// LOOP
// ============================================================================

void loop() {
  // Handle HTTP requests if connected
  if (wifiConnected) {
    server.handleClient();
  }

  // Update components
  updateBuzzer();

  if (lightSensorEnabled) {
    updateLightState();
  }

  checkWifiConnection();

  if (displayNeedsUpdate && displayActive) {
    updateDisplay();
    displayNeedsUpdate = false;
  }

  checkDisplayTimeout();

  delay(10);
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
      displayNeedsUpdate = true;
      enableDisplay();
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
    displayNeedsUpdate = true;
    enableDisplay();

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
  // Initialize pins
  pinMode(LIGHT_PIN, INPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);

  // Initialize OLED
  Wire.begin(OLED_SDA, OLED_SCL);
  if (!display.begin(SSD1306_SWITCHCAPVCC, SCREEN_ADDRESS)) {
    while (true) {}  // Halt if display initialization fails
  }

  // Light sensor is disabled until after WiFi connection
  lightSensorEnabled = false;
}

void enableLightSensor() {
  lightSensorEnabled = true;

  // Initialize with first reading
  int rawLevel = digitalRead(LIGHT_PIN);
  if (LIGHT_ACTIVE_LOW) {
    lastRawOn = (rawLevel == LOW);
  } else {
    lastRawOn = (rawLevel == HIGH);
  }

  lastRawChangeMs = millis();
  lastPollMs = millis();

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

  int lightValue = 0;
  if (lightState.hasValue) {
    lightValue = lightState.isOn ? 1 : 0;
  }

  String json = "{";
  json += "\"id\":\"" + String(DEVICE_ID) + "\",";
  json += "\"name\":\"" + String(DEVICE_NAME) + "\",";
  json += "\"sensors\":{";
  json += "\"light\":" + String(lightValue);
  json += "}}";

  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.send(200, "application/json; charset=utf-8", json);
}

// ============================================================================
// BUZZER CONTROL
// ============================================================================

void startBuzzer() {
  buzzerStartMs = millis();
  buzzerActive = true;
  digitalWrite(BUZZER_PIN, HIGH);
}

void updateBuzzer() {
  if (!buzzerActive) return;

  unsigned long now = millis();

  // Stop after duration
  if (now - buzzerStartMs >= BUZZER_DURATION_MS) {
    digitalWrite(BUZZER_PIN, LOW);
    buzzerActive = false;
  }
}

// ============================================================================
// LIGHT SENSOR
// ============================================================================

void updateLightState() {
  if (!lightSensorEnabled) return;

  unsigned long now = millis();

  // Poll at appropriate interval
  if (now - lastPollMs < currentPollInterval) {
    return;
  }
  lastPollMs = now;

  // Read sensor
  int rawLevel = digitalRead(LIGHT_PIN);
  bool rawOn;

  if (LIGHT_ACTIVE_LOW) {
    rawOn = (rawLevel == LOW);
  } else {
    rawOn = (rawLevel == HIGH);
  }

  // Detect changes
  if (rawOn != lastRawOn) {
    lastRawOn = rawOn;
    lastRawChangeMs = now;
    currentPollInterval = LIGHT_POLL_INTERVAL_ACTIVE_MS;
  }

  // Initialize state if not yet set
  if (!lightState.hasValue) {
    if (now - lastRawChangeMs >= LIGHT_DEBOUNCE_MS) {
      lightState.isOn = rawOn;
      lightState.hasValue = true;
      lightState.lastChangeMs = now;
      enableDisplay();
      displayNeedsUpdate = true;
    }
    return;
  }

  // Update state if changed and debounced
  if (rawOn != lightState.isOn &&
      now - lastRawChangeMs >= LIGHT_DEBOUNCE_MS) {
    lightState.isOn = rawOn;
    lightState.lastChangeMs = now;
    enableDisplay();
    displayNeedsUpdate = true;
    currentPollInterval = LIGHT_POLL_INTERVAL_ACTIVE_MS;
  }

  // Slow down polling if state is stable
  if (now - lightState.lastChangeMs > 5000) {
    currentPollInterval = LIGHT_POLL_INTERVAL_STABLE_MS;
  }
}

// ============================================================================
// DISPLAY CONTROL
// ============================================================================

void enableDisplay() {
  if (!displayActive) {
    display.ssd1306_command(SSD1306_DISPLAYON);
    displayActive = true;
  }
  lastDisplayActionMs = millis();
  displayNeedsUpdate = true;
}

void disableDisplay() {
  if (displayActive) {
    display.ssd1306_command(SSD1306_DISPLAYOFF);
    displayActive = false;
  }
}

void checkDisplayTimeout() {
  unsigned long now = millis();

  // Keep display on if light is on
  if (lightState.hasValue && lightState.isOn) {
    return;
  }

  // Turn off display after timeout (only when light is off)
  if (displayActive && now - lastDisplayActionMs >= DISPLAY_TIMEOUT_MS) {
    disableDisplay();
  }
}

void updateDisplay() {
  if (!displayActive) return;

  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);

  // Device name
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.println(DEVICE_NAME);

  // Light status
  display.setTextSize(2);
  display.setCursor(0, 18);
  display.print("Light: ");
  if (lightState.hasValue) {
    display.println(lightState.isOn ? "ON" : "OFF");
  } else {
    display.println("--");
  }

  // Network status
  display.setTextSize(1);
  display.setCursor(0, 46);
  if (wifiConnected) {
    display.print("IP: ");
    display.print(WiFi.localIP());
  } else {
    display.print("Mode: Local");
  }

  display.display();
}