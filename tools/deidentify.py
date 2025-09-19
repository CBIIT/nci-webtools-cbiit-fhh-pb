import json
import sys
import os
import glob
from pathlib import Path

def deidentify_names(data):
    """
    Deidentify names in JSON data by converting first names to initials
    and last names to consistent random colors.
    
    Args:
        data (dict): Input JSON data
    
    Returns:
        tuple: (deidentified_data, mapping_used)
    """
    
    # Color palette for last names
    colors = [
        'Red', 'Blue', 'Green', 'Yellow', 'Orange', 'Purple', 'Pink', 'Brown', 
        'Gray', 'Black', 'White', 'Cyan', 'Magenta', 'Lime', 'Indigo', 'Violet',
        'Turquoise', 'Gold', 'Silver', 'Maroon', 'Navy', 'Olive', 'Teal', 'Aqua',
        'Crimson', 'Coral', 'Salmon', 'Khaki', 'Plum', 'Orchid', 'Tan', 'Beige'
    ]
    
    # Track last name to color mapping
    last_name_to_color = {}
    color_index = 0
    
    def get_color_for_last_name(last_name):
        nonlocal color_index
        if last_name not in last_name_to_color:
            last_name_to_color[last_name] = colors[color_index % len(colors)]
            color_index += 1
        return last_name_to_color[last_name]
    
    def deidentify_name(full_name):
        if not full_name or full_name == "Unknown":
            return full_name
        
        # Handle cases where only last name is given
        if ' ' not in full_name:
            return get_color_for_last_name(full_name)
        
        # Split name into parts
        name_parts = full_name.strip().split(' ')
        first_name = name_parts[0]
        last_name = name_parts[-1]  # Last part is the last name
        
        # Get first initial
        first_initial = first_name[0].upper()
        
        # Get color for last name
        color_last_name = get_color_for_last_name(last_name)
        
        return f"{first_initial}. {color_last_name}"
    
    # Create a copy to avoid modifying the original
    import copy
    result_data = copy.deepcopy(data)
    
    # Process all people in the data
    names_processed = 0
    if 'people' in result_data:
        for person_id, person in result_data['people'].items():
            if 'name' in person:
                original_name = person['name']
                person['name'] = deidentify_name(original_name)
                names_processed += 1
    
    return result_data, last_name_to_color, names_processed

def process_directory(directory_path):
    """
    Process all JSON files in a directory and create deidentified versions.
    
    Args:
        directory_path (str): Path to directory containing JSON files
    """
    
    # Convert to Path object for easier handling
    dir_path = Path(directory_path)
    
    if not dir_path.exists():
        print(f"❌ Error: Directory '{directory_path}' does not exist.")
        return
    
    if not dir_path.is_dir():
        print(f"❌ Error: '{directory_path}' is not a directory.")
        return
    
    # Find all JSON files in the directory
    json_files = []
    for pattern in ['*.json', '*.JSON']:
        json_files.extend(dir_path.glob(pattern))
    
    if not json_files:
        print(f"❌ No JSON files found in '{directory_path}'")
        return
    
    print(f"📁 Found {len(json_files)} JSON file(s) to process...")
    print(f"📂 Processing directory: {dir_path.absolute()}")
    print("-" * 60)
    
    total_names_processed = 0
    all_mappings = {}
    successful_files = 0
    
    for json_file in sorted(json_files):
        try:
            print(f"\n📄 Processing: {json_file.name}")
            
            # Read the JSON file
            with open(json_file, 'r', encoding='utf-8') as file:
                data = json.load(file)
            
            # Deidentify the data
            deidentified_data, mapping_used, names_count = deidentify_names(data)
            
            # Create output filename with 'de.' prefix
            output_filename = f"de-{json_file.name}"
            output_path = json_file.parent / output_filename
            
            # Save the deidentified data
            with open(output_path, 'w', encoding='utf-8') as file:
                json.dump(deidentified_data, file, indent=2, ensure_ascii=False)
            
            print(f"   ✅ Names processed: {names_count}")
            print(f"   💾 Output saved: {output_filename}")
            
            # Track overall statistics
            total_names_processed += names_count
            all_mappings.update(mapping_used)
            successful_files += 1
            
            # Show mapping for this file if any names were processed
            if mapping_used:
                print(f"   🎨 Mappings used: {', '.join([f'{k}→{v}' for k, v in mapping_used.items()])}")
            
        except json.JSONDecodeError as e:
            print(f"   ❌ Invalid JSON format in {json_file.name}: {e}")
        except Exception as e:
            print(f"   ❌ Error processing {json_file.name}: {e}")
    
    # Final summary
    print("\n" + "=" * 60)
    print(f"🎉 PROCESSING COMPLETE!")
    print(f"📊 Files processed successfully: {successful_files}/{len(json_files)}")
    print(f"👥 Total names deidentified: {total_names_processed}")
    print(f"🎨 Unique last names found: {len(all_mappings)}")
    
    if all_mappings:
        print(f"\n🗂️  Complete Last Name → Color Mapping:")
        for last_name, color in sorted(all_mappings.items()):
            print(f"   {last_name} → {color}")

def main():
    """Main function to handle command line arguments"""
    if len(sys.argv) != 2:
        print("Usage: python deidentifier.py <directory_path>")
        print("Example: python deidentifier.py ./data")
        print("Example: python deidentifier.py /path/to/json/files")
        print("\nThis will process all .json files in the directory and create")
        print("deidentified versions with 'de.' prefix (e.g., data.json → de.data.json)")
        return
    
    directory_path = sys.argv[1]
    process_directory(directory_path)

if __name__ == "__main__":
    main()

