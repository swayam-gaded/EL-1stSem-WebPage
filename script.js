// --- Global Setup (Assumes 'database' object is available from HTML) ---

// Get references to the specific database paths
// These paths are where the ESP32 will WRITE to and where the Laptop/Phone will WRITE to
const userInputsRef = database.ref('EV_Schedule/user_inputs');
const metricsRef = database.ref('EV_Schedule/realtime_metrics');
const systemStateRef = database.ref('EV_Schedule/system_state');

// This function runs when the page loads
window.onload = function() {
    // 1. ATTACH INPUT HANDLERS (Connect the button to the function)
    const saveButton = document.getElementById('save-schedule-button'); // Ensure your button has this ID!
    if (saveButton) {
        saveButton.addEventListener('click', sendInputsToDB); // When clicked, run the input function
    }

    // 2. START REAL-TIME LISTENERS (Update the output region)
    startOutputListeners();
    
    // 3. START PHONE-SPECIFIC LOGIC (Only runs if the device can check battery)
    checkAndStartPhoneLogic(); 
};

// --- Function to Write Inputs to Firebase ---
function sendInputsToDB() {
    // 1. Get values from the Input Region (Ensure IDs match your HTML input fields)
    const targetSoc = document.getElementById('target-soc-input').value;
    const chargePower = document.getElementById('charging-power-input').value; // Added Charge Power input
    const departureTime = document.getElementById('departure-time-input').value;

    // Basic Input Validation (Crucial for first-semester code!)
    if (!targetSoc || !chargePower || !departureTime) {
        alert("Please fill all input fields.");
        return; 
    }

    // 2. Write data to the /user_inputs path
    userInputsRef.set({
        target_soc_level: parseFloat(targetSoc),
        charger_rate_kw: parseFloat(chargePower),
        departure_time: departureTime,
    })
    .then(() => {
        alert("Schedule Sent to ESP32 Successfully!");
        // Optional: Reset input fields or give visual confirmation
    })
    .catch((error) => {
        console.error("Firebase Write Error:", error);
        alert("Error saving schedule. Check console.");
    });
}

// --- Function to Listen to Firebase for Real-Time Changes ---
function startOutputListeners() {
    // 1. Listen for Load (Written by ESP32)
    metricsRef.child('total_house_load_amps').on('value', (snapshot) => {
        const currentLoad = snapshot.val(); // e.g., 5.23
        document.getElementById('current-load-display').textContent = `${currentLoad ? currentLoad.toFixed(2) : '0.00'} Amps`;
    });

    // 2. Listen for Charging Status (Written by ESP32 Logic)
    systemStateRef.child('charger_status').on('value', (snapshot) => {
        const status = snapshot.val(); // e.g., "CHARGE" or "WAIT"
        const statusElement = document.getElementById('charger-status-display');
        statusElement.textContent = status || 'N/A';
        
        // Add visual feedback based on status
        if (status === 'CHARGE') {
            statusElement.style.backgroundColor = '#4CAF50'; // Green
        } else if (status === 'WAIT') {
            statusElement.style.backgroundColor = '#FFC107'; // Yellow
        } else {
            statusElement.style.backgroundColor = 'lightgray';
        }
    });
    
    // 3. Listen for Phone's SoC (Written by the phone's browser, needed for display on laptop)
    metricsRef.child('phone_soc').on('value', (snapshot) => {
        const phoneSoc = snapshot.val();
        document.getElementById('current-battery-display').textContent = `${phoneSoc || '--'}%`;
    });
}

// --- Logic for Phone-Specific Tasks (Runs ONLY on the phone's browser) ---
function checkAndStartPhoneLogic() {
    // Check if the browser supports the Battery Status API
    if ("getBattery" in navigator) {
        navigator.getBattery().then((battery) => {
            
            // Function to upload the battery status to Firebase
            const uploadBatteryStatus = () => {
                const level = Math.round(battery.level * 100);
                
                // Write data to the 'realtime_metrics' path
                metricsRef.child('phone_soc').set(level); 
            };
            
            // 1. Upload initial status
            uploadBatteryStatus();

            // 2. Set listener to upload status every time the level changes
            battery.addEventListener('levelchange', uploadBatteryStatus);
            
            // Optional: You can also set a timer to upload every 5 minutes regardless of change
            setInterval(uploadBatteryStatus, 300000); // 5 minutes in milliseconds
            
        }).catch(error => {
            console.warn("Battery API error/blocked:", error);
            // Fallback for debugging if the browser blocks it
            metricsRef.child('phone_soc').set("API_Blocked");
        });
    }
}