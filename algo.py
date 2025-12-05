import firebase_admin
from firebase_admin import credentials, db
from datetime import datetime
import time

# ------------------------
# Linking the database with the algorithm to get inputs and compute outputs
# ------------------------
cred = credentials.Certificate("serviceAccountKey.json")
firebase_admin.initialize_app(cred, {
    'databaseURL': "YOUR_FIREBASE_DB_URL"
})

def calculate_charging_decision(data):
    
# Gets all the input from the database
    current_soc = data["current_soc"]
    target_soc = data["target_soc"]
    battery_capacity = data["battery_capacity"]
    charger_power = data["charger_power"]
    current_load = data["current_load"]
    safety_margin = data["safety_margin"]

    # ------------------------
    # Convert departure time into minutes
    # ------------------------
    now = datetime.now()
    dep_hour, dep_min = map(int, data["departure_time"].split(":"))
    departure_dt = now.replace(hour=dep_hour, minute=dep_min, second=0)

    if departure_dt < now:
        # means departure is next day and it adds 24 hrs to the time left
        departure_dt = departure_dt.replace(day=now.day + 1)

    time_left_hours = (departure_dt - now).total_seconds() / 3600

    # ------------------------
    # this part calculates the energy needed using the SoC values
    # ------------------------
    soc_needed = target_soc - current_soc
    if soc_needed < 0:
        soc_needed = 0

    energy_needed = (soc_needed / 100) * battery_capacity

    # Charging time estimation
    if charger_power > 0:
        time_required_hours = energy_needed / charger_power
    else:
        time_required_hours = 9999  # avoids division by zero

    # ------------------------
    # Rule 1: Check if departure is too soon to complete charging and starts charging immediately if yes
    # ------------------------
    if time_required_hours > time_left_hours:
        return "START_CHARGING_IMMEDIATELY (Not Enough Time Before Departure)"

    # ------------------------
    # Rule 2: checking whether the grid is overloaded and if yes, then stop charging
    # ------------------------
    if current_load > safety_margin:
        return "STOP_CHARGING (Grid Overload Protection)"

    # ------------------------
    # Rule 3: Normal Charging Decision
    # As the code repeats every 3 seconds, it will keep checking and charging until target SoC is reached and sends a STOP signal 
    # ------------------------
    if current_soc < target_soc:
        return "CHARGE"
    else:
        return "STOP_CHARGING (Target Reached)"


# ------------------------
# Main Loop
# ------------------------
def start_scheduler():
    print("Scheduler running...")

    while True:
        # Read inputs from Firebase
        inputs_ref = db.reference("EV_INPUTS")
        input_data = inputs_ref.get()

        if input_data:
            decision = calculate_charging_decision(input_data)

            # Write decision back to Firebase
            decision_ref = db.reference("EV_DECISION")
            decision_ref.set({"decision": decision})

            print("Decision:", decision)

        time.sleep(3)  # It runs the code every 3 seconds to calculate real-time decisions


if __name__ == "__main__":
    start_scheduler()