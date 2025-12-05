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
   --> .set is a function that is derived from the db libraries which were pulled from 
        script in html file.*/ 
    userInputsRef.set({
        target_soc_level: parseInt(targetSoc),
        charger_rate_kw: parseFloat(chargePower),
        departure_time: departureTime,
    })
    .then(() => {
        alert("Schedule Saved Successfully!");
    })
    .catch((error) => {
        console.error("Firebase Write Error:", error);
        alert("Error saving schedule. Resolve the issue!!");
    });
}

// to display the output part of the website 
function outputToWeb() {
    // gets real time load data from the microprocessor
    metricsRef.child('total_house_load_amps').on('value', (snapshot) => {
        const currentLoad = snapshot.val(); // e.g., 5.23
        document.getElementById('curr-load').textContent = `${currentLoad ? currentLoad.toFixed(2) : '0.00'} Amps`;
    });

    // waits on for algo to make its decision done on microprocessor and sends tht to charger status node
    systemStateRef.child('charger_status').on('value', (snapshot) => {
        const status = snapshot.val();
        const statusElement = document.getElementById('curr-battery');
        statusElement.textContent = status || 'N/A';
        
        // to tell if it is charging has started or not visually
        if (status === 'CHARGE') {
            statusElement.style.backgroundColor = '#4CAF50'; 
        } else if (status === 'WAIT') {
            statusElement.style.backgroundColor = '#FFC107'; 
        } else {
            statusElement.style.backgroundColor = 'lightgray';
        }
    });
    
    // to display the current battery level from the phone function 
    metricsRef.child('phone_soc').on('value', (snapshot) => {
        const phoneSoc = snapshot.val();
        document.getElementById('curr-battery').textContent = `${phoneSoc || '--'}%`;
    });
}

// to get battery level from phone 
function phoneBattery() {
    /* navigator is the built-in js object that represents the browser and the website it is running on
      --> battery in the .then is the object or the promise given from the getBattery() function */
    if ("getBattery" in navigator) {
        navigator.getBattery().then((battery) => {
            
            // to upload battery level to db
            const uploadBatteryStatus = () => {
                const level = Math.round(battery.level * 100);
                // to enter the value
                metricsRef.child('phone_soc').set(level); 
            };
            // to call the above function
            uploadBatteryStatus();

            // the levelchange is monitored by the OS of the phone which updates it whenever its battery changes
            battery.addEventListener('levelchange', uploadBatteryStatus);
            
            // this is so tht the uploadBatteryStatus function is called even when the event levelchange does not happen
            setInterval(uploadBatteryStatus, 300000); // 5 minutes in milliseconds
            
        }).catch(error => {
            console.warn("Battery API error/blocked:", error);
            // Fallback for debugging if the browser blocks it
            metricsRef.child('phone_soc').set("API_Blocked");
        }); 
    }
}

