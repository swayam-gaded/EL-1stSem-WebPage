// database is the variable that was declared on the script tag of the html file 

/*These below variables are just pointers to their respective nodes on the database 
    --> EV_Schedule is my root node on the database 
    --> user_inputs, realtime_metrics, system_state are the sub nodes of the root node 
    --> if these nodes are not present then it will show no such node is created */
const userInputsRef = database.ref('EV_Schedule/user_inputs');
const metricsRef = database.ref('EV_Schedule/realtime_metrics');
const systemStateRef = database.ref('EV_Schedule/system_state');


/*window.onload is a function where window is your entire webpage and onload allows the
  function defined below it to run only after every file is loaded. */
window.onload = function() {
    // saveButton gives a truthy value if it finds the element and it's type is of an object
    const saveButton = document.getElementById('start-button');
    if (saveButton) {
        // this calls the function when click event happens 
        saveButton.addEventListener('click', inputToDB);
    }
    // calls the output function
    outputToWeb();
    // calls the battery of phone function
    phoneBattery(); 
};

// Input to Database function 
function inputToDB() {
    // to get the values from the website
    const targetSoc = document.getElementById('target-soc').value;
    const chargePower = document.getElementById('charging-power').value;
    const departureTime = document.getElementById('departure-time').value;

    //to check if every value is inputted 
    if (!targetSoc || !chargePower || !departureTime) {
        alert("Please fill all input fields.");
        return; 
    }

   /* to send the data to DB and output the result 
    --> */ 
    userInputsRef.set({
        target_soc_level: parseFloat(targetSoc),
        charger_rate_kw: parseFloat(chargePower),
        departure_time: departureTime,
    })
    .then(() => {
        alert("Schedule Saved Successfully!");
        // Optional: Reset input fields or give visual confirmation
    })
    .catch((error) => {
        console.error("Firebase Write Error:", error);
        alert("Error saving schedule. Resolve the issue!!");
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

