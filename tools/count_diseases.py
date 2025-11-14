import os
import json
from collections import Counter

# --- Configuration ---
DATA_DIR = "../data/processed"  # 👈 change this to your JSON folder path

# --- Initialize a Counter for disease codes ---
disease_counts = Counter()

# --- Process all JSON files in the directory ---
for filename in os.listdir(DATA_DIR):
    if not filename.endswith(".json"):
        continue  # skip non-JSON files

    filepath = os.path.join(DATA_DIR, filename)
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        print(f"⚠️ Skipping {filename}: {e}")
        continue

    # --- Safely walk through people and collect disease codes ---
    people = data.get("people", {})
    for person_id, person_data in people.items():
        diseases = person_data.get("diseases", [])
        for disease in diseases:
            code = disease.get("code")
            if code:
                disease_counts[code] += 1

# --- Print summary ---
print("Disease Code Counts:\n")
for code, count in disease_counts.most_common():
    print(f"{code}: {count}")

# --- Save results as CSV ---
output_path = os.path.join(DATA_DIR, "disease_code_counts.csv")
with open(output_path, "w", encoding="utf-8") as f:
    f.write("code,count\n")
    for code, count in disease_counts.most_common():
        f.write(f"{code},{count}\n")

print(f"\n✅ Done! Results saved to: {output_path}")
