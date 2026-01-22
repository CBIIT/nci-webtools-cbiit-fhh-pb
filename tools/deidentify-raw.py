import json
import sys
import os
import re
import glob
from pathlib import Path

def deidentify_names(data, existing_mapping=None):
    """
    Deidentify names in JSON data by converting first names to initials
    and last names to consistent random colors.
    
    Args:
        data (list): Input JSON data (array of records)
        existing_mapping (dict): Optional existing last_name to color mapping
                                to maintain consistency across files
    
    Returns:
        tuple: (deidentified_data, mapping_used, names_processed)
    """
    
    # Color palette for last names
    colors = [
        'Red', 'Blue', 'Green', 'Yellow', 'Orange', 'Purple', 'Pink', 'Brown', 
        'Gray', 'Black', 'White', 'Cyan', 'Magenta', 'Lime', 'Indigo', 'Violet',
        'Turquoise', 'Gold', 'Silver', 'Maroon', 'Navy', 'Olive', 'Teal', 'Aqua',
        'Crimson', 'Coral', 'Salmon', 'Khaki', 'Plum', 'Orchid', 'Tan', 'Beige'
    ]
    
    # Track last name to color mapping
    # Use existing mapping if provided, otherwise start fresh
    if existing_mapping is None:
        last_name_to_color = {}
        color_index = 0
    else:
        last_name_to_color = existing_mapping.copy()
        color_index = len(existing_mapping)
    
    def get_color_for_last_name(last_name):
        nonlocal color_index
        if last_name not in last_name_to_color:
            last_name_to_color[last_name] = colors[color_index % len(colors)]
            color_index += 1
        return last_name_to_color[last_name]
    
    def deidentify_name_fields(first_name, last_name):
        """
        Deidentify first and last name fields.
        Returns tuple: (deidentified_first, deidentified_last)
        """
        # Handle empty or missing names - only skip if BOTH are empty
        if (not first_name and not last_name):
            return first_name, last_name
        
        # Process first name - get first initial
        if first_name and len(first_name) > 0:
            first_initial = first_name[0].upper()
        else:
            first_initial = first_name if first_name else ""
        
        # Process last name - always convert to color (even if first name is multi-word)
        if last_name and len(last_name) > 0:
            color_last_name = get_color_for_last_name(last_name.upper())
        else:
            color_last_name = last_name if last_name else ""
        
        return first_initial, color_last_name
    
    # Create a copy to avoid modifying the original
    import copy
    result_data = copy.deepcopy(data)
    
    # Field names to target
    first_name_field = "Merge1[123a.result.participant.first_name]"
    last_name_field = "Merge1[123a.result.participant.last_name]"
    
    # Process all records in the data
    names_processed = 0
    mappings_used_in_file = {}  # Track only mappings actually used in this file
    
    if isinstance(result_data, list):
        for record in result_data:
            if first_name_field in record and last_name_field in record:
                original_first = record[first_name_field]
                original_last = record[last_name_field]
                
                # Deidentify the names
                new_first, new_last = deidentify_name_fields(original_first, original_last)
                
                record[first_name_field] = new_first
                record[last_name_field] = new_last
                names_processed += 1
                
                # Track the mapping actually used for this record
                if original_last:
                    mappings_used_in_file[original_last.upper()] = new_last
    
    return result_data, mappings_used_in_file, names_processed

def process_directory(directory_path):
    """
    Process all JSON files in a directory and create deidentified versions.
    Only processes files matching pattern: numbers.json (e.g., 08127.json)
    Each file gets a fresh color mapping (colors reset per file).
    
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
    
    # Find all JSON files in the directory that match the pattern: numbers.json
    # Pattern matches filenames that are only digits followed by .json
    pattern = re.compile(r'^\d+\.json$', re.IGNORECASE)
    
    json_files = []
    for file_path in dir_path.iterdir():
        if file_path.is_file() and pattern.match(file_path.name):
            json_files.append(file_path)
    
    if not json_files:
        print(f"❌ No JSON files matching pattern '[numbers].json' found in '{directory_path}'")
        print(f"   Looking for files like: 08127.json, 12345.json, etc.")
        return
    
    print(f"🔍 Found {len(json_files)} JSON file(s) to process...")
    print(f"📂 Processing directory: {dir_path.absolute()}")
    print("-" * 60)
    
    total_names_processed = 0
    successful_files = 0
    
    for json_file in sorted(json_files):
        try:
            print(f"\n📄 Processing: {json_file.name}")
            
            # Read the JSON file
            with open(json_file, 'r', encoding='utf-8') as file:
                data = json.load(file)
            
            # Deidentify the data (no existing mapping - fresh colors for each file)
            deidentified_data, mapping_used, names_count = deidentify_names(data)
            
            # Create output filename with 'de-' prefix
            output_filename = f"de-{json_file.name}"
            output_path = json_file.parent / output_filename
            
            # Save the deidentified data
            with open(output_path, 'w', encoding='utf-8') as file:
                json.dump(deidentified_data, file, indent=2, ensure_ascii=False)
            
            print(f"   ✅ Names processed: {names_count}")
            print(f"   💾 Output saved: {output_filename}")
            
            # Track overall statistics
            total_names_processed += names_count
            successful_files += 1
            
            # Show mappings used in this specific file
            if mapping_used and names_count > 0:
                print(f"   🎨 Color Mappings for this file:")
                for last_name, color in sorted(mapping_used.items()):
                    print(f"      {last_name} → {color}")
            
        except json.JSONDecodeError as e:
            print(f"   ❌ Invalid JSON format in {json_file.name}: {e}")
        except Exception as e:
            print(f"   ❌ Error processing {json_file.name}: {e}")
    
    # Final summary
    print("\n" + "=" * 60)
    print(f"🎉 PROCESSING COMPLETE!")
    print(f"📊 Files processed successfully: {successful_files}/{len(json_files)}")
    print(f"👥 Total names deidentified: {total_names_processed}")

def main():
    """Main function to handle command line arguments"""
    if len(sys.argv) != 2:
        print("Usage: python deidentify.py <directory_path>")
        print("Example: python deidentify.py ./data")
        print("Example: python deidentify.py /path/to/json/files")
        print("\nThis will process all .json files matching pattern '[numbers].json'")
        print("(e.g., 08127.json, 12345.json) and create deidentified versions")
        print("with 'de-' prefix (e.g., 08127.json → de-08127.json)")
        print("\nThe script will:")
        print("  - Convert first names to initials")
        print("  - Replace last names with colors")
        print("  - Ensure family members within each file get the same color")
        print("  - Color mappings reset for each file (independent per file)")
        return
    
    directory_path = sys.argv[1]
    process_directory(directory_path)

if __name__ == "__main__":
    main()