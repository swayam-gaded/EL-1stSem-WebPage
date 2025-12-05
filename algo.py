import firebase_admin
from firebase_admin import credentials, db
from datetime import datetime, timedelta
import time
import traceback

# ------------------------
# Linking the database with the algorithm to get inputs and compute outputs
# ------------------------
cred = credentials.Certificate("serviceAccountKey.json")
firebase_admin.initialize_app(cred, {
    'databaseURL': "YOUR_FIREBASE_DB_URL"
})

def safe_float(value, default=None):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default

def calculate_charging_decision(data):
   

    # Parse & validate inputs (use defaults of None so we can detect errors)
    current_soc = safe_float(data.get("current_soc"))
    target_soc = safe_float(data.get("target_soc"))
    battery_capacity = safe_float(data.get("battery_capacity"))
    charger_power = safe_float(data.get("charger_power"))
    current_load = safe_float(data.get("current_load"))
    safety_margin = safe_float(data.get("safety_margin"))
    departure_time_str = data.get("departure_time")

    # Validate numeric existence
    numeric_fields = {
        "current_soc": current_soc,
        "target_soc": target_soc,
        "battery_capacity": battery_capacity,
        "charger_power": charger_power,
        "current_load": current_load,
        "safety_margin": safety_margin
    }
    missing_or_bad = [k for k, v in numeric_fields.items() if v is None]
    if missing_or_bad:
        raise ValueError(f"Bad or missing numeric inputs: {', '.join(missing_or_bad)}")

    # Validate SOC range (0-100)
    if not (0 <= current_soc <= 100 and 0 <= target_soc <= 100):
        raise ValueError("SOC values must be between 0 and 100.")

    # ------------------------
    # Convert departure time into minutes safely
    # ------------------------
    if not departure_time_str or ":" not in departure_time_str:
        raise ValueError("departure_time must be a string 'HH:MM'")

    now = datetime.now()
    try:
        dep_hour, dep_min = map(int, departure_time_str.split(":"))
    except Exception:
        raise ValueError("departure_time format should be HH:MM (e.g. '07:30')")

    # construct a departure datetime for today at dep_hour:dep_min
    departure_dt = now.replace(hour=dep_hour, minute=dep_min, second=0, microsecond=0)

    if departure_dt <= now:
        # departure is next day
        departure_dt = departure_dt + timedelta(days=1)

    time_left_hours = (departure_dt - now).total_seconds() / 3600.0

    # ------------------------
    # energy needed using the SoC values
    # ------------------------
    soc_needed = max(0.0, target_soc - current_soc)
    energy_needed = (soc_needed / 100.0) * battery_capacity  # kWh or whatever units battery_capacity uses

    # Charging time estimation
    if charger_power and charger_power > 0:
        time_required_hours = energy_needed / charger_power
    else:
        # If charger_power is 0 or negative, treat as impossible to charge
        time_required_hours = float("inf")

    # ------------------------
    # Rule 1: Check if departure is too soon to complete charging and starts charging immediately if yes
    # ------------------------
    if time_required_hours > time_left_hours:
        return "START_CHARGING_IMMEDIATELY (Not Enough Time Before Departure)"

    # ------------------------
    # Rule 2: checking whether the grid is overloaded and if yes, then stop charging
    # ------------------------
    # safety_margin is the maximum allowed load threshold; if current_load exceeds it -> stop
    if current_load > safety_margin:
        return "STOP_CHARGING (Grid Overload Protection)"

    # ------------------------
    # Rule 3: Normal Charging Decision
    # ------------------------
    if current_soc < target_soc:
        return "CHARGE"
    else:
        return "STOP_CHARGING (Target Reached)"


# ------------------------
# Main Loop which runs every 3 seconds
# ------------------------
def start_scheduler():
    print("Scheduler running...")

    required_fields = [
        "current_soc", "target_soc", "battery_capacity",
        "charger_power", "current_load", "safety_margin", "departure_time"
    ]

    last_decision = None  # track previous decision to avoid redundant writes

    while True:
        try:
            inputs_ref = db.reference("EV_INPUTS")
            input_data = inputs_ref.get()

            if not input_data:
                error_message = "No EV_INPUTS data found in Firebase."
                print(error_message)
                db.reference("EV_DECISION").set({"error": error_message})
                time.sleep(3)
                continue

            # Check for missing inputs keys
            missing = [field for field in required_fields if field not in input_data]
            if missing:
                error_message = f"Missing input(s): {', '.join(missing)}"
                print(error_message)
                db.reference("EV_DECISION").set({"error": error_message})
                time.sleep(3)
                continue

            # Calculate decision (wrap in try to catch validation errors inside function.)
            try:
                decision = calculate_charging_decision(input_data)
            except Exception as e:
                
                err_text = f"Error calculating decision: {e}"
                print(err_text)
                db.reference("EV_DECISION").set({"error": err_text})
                time.sleep(3)
                continue

            # Only write to Firebase if decision changed (reduces writes)
            if decision != last_decision:
                db.reference("EV_DECISION").set({"decision": decision})
                last_decision = decision
                print("Decision written:", decision)
            else:
                # optional: still print for visibility, but avoid writing
                print("Decision (unchanged):", decision)

        except Exception as e:
            # Catch unexpected exceptions so scheduler keeps running
            print("Unhandled error in scheduler loop:", e)
            traceback.print_exc()
            try:
                db.reference("EV_DECISION").set({"error": f"Scheduler exception: {e}"})
            except Exception:
                # If DB write failed, keep going
                pass

        time.sleep(3)


if __name__ == "__main__":
    start_scheduler()
