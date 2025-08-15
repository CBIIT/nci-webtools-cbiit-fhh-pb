#!/usr/bin/env python3
"""
JSON FHH Pedigree Data Processor

This module processes FHH pedigree data from JSON files, transforming flat records
into a structured format with person-centric data organization including
demographics, diseases, procedures, and family relationships.
"""

import json
import re
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

class JSONProcessor:
    """
    A class to handle JSON medical data processing and transformation.

    This processor takes medical records in JSON format and reorganizes them
    into a person-centric structure with relationships, demographics, diseases,
    and procedures properly grouped.
    """

    def __init__(self):
        #self.proband = None
        self.general = defaultdict(dict)
        self.people = defaultdict(dict)

    def load_s3_json(self, s3_obj) -> Optional[Dict[str, Any]]:
        """
        Load and parse a JSON file with comprehensive error handling.

        Args:
            file_path: Path to the JSON file

        Returns:
            Parsed JSON data as dictionary, or None if loading failed

        Raises:
            FileNotFoundError: If the file doesn't exist
            json.JSONDecodeError: If the file contains invalid JSON
            UnicodeDecodeError: If file encoding is incompatible
        """
        try:
            data = json.loads(s3_obj)
            print(f"[INFO] Successfully loaded JSON from S3")
            return data
        except json.JSONDecodeError as e:
            print(f"[ERROR] Invalid JSON format in: {e}")
            raise
        except UnicodeDecodeError as e:
            print(f"[ERROR] Encoding issue in: {e}")
            raise
        except Exception as e:
            print(f"[ERROR] Unexpected error loading: {e}")
            raise

    def load_json(self, file_path: Union[str, Path]) -> Optional[Dict[str, Any]]:
        """
        Load and parse a JSON file with comprehensive error handling.

        Args:
            file_path: Path to the JSON file

        Returns:
            Parsed JSON data as dictionary, or None if loading failed

        Raises:
            FileNotFoundError: If the file doesn't exist
            json.JSONDecodeError: If the file contains invalid JSON
            UnicodeDecodeError: If file encoding is incompatible
        """
        file_path = Path(file_path)

        if not file_path.exists():
            raise FileNotFoundError(f"JSON file not found: {file_path}")

        if not file_path.is_file():
            raise ValueError(f"Path is not a file: {file_path}")

        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                print(f"[INFO] Successfully loaded JSON from: {file_path}")
                return data
        except json.JSONDecodeError as e:
            print(f"[ERROR] Invalid JSON format in {file_path}: {e}")
            raise
        except UnicodeDecodeError as e:
            print(f"[ERROR] Encoding issue in {file_path}: {e}")
            raise
        except Exception as e:
            print(f"[ERROR] Unexpected error loading {file_path}: {e}")
            raise

    def save_json(self, data: Dict[str, Any], output_path: Union[str, Path], indent: int = 2) -> None:
        """
        Save data to JSON file with pretty formatting.

        Args:
            data: Dictionary to save as JSON
            output_path: Destination file path
            indent: Number of spaces for indentation (default: 2)

        Raises:
            OSError: If file cannot be written
            TypeError: If data is not JSON serializable
        """
        output_path = Path(output_path)

        # Create parent directories if they don't exist
        output_path.parent.mkdir(parents=True, exist_ok=True)

        try:
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=indent, ensure_ascii=False)
            print(f"[INFO] JSON successfully written to: {output_path}")

        except TypeError as e:
            print(f"[ERROR] Data not JSON serializable: {e}")
            raise
        except OSError as e:
            print(f"[ERROR] Failed to write file {output_path}: {e}")
            raise

    def extract_person_data(self, record: Dict[str, Any]) -> Dict[str, Any]:
        """
        Extract and structure person data from a medical record.

        Args:
            record: Raw medical record dictionary

        Returns:
            Structured person data dictionary
        """
        person_id = record.get('Merge1[Subject]', '')
        if not person_id:
            raise ValueError("Record missing required Subject ID")

        # Extract basic information
        first_name = record.get('Merge1[123a.result.participant.first_name]', '')
        last_name = record.get('Merge1[123a.result.participant.last_name]', '')
        full_name = f"{first_name} {last_name}".strip()

        # Build person structure
        person_data = {
            'name': full_name,
            'born': record.get('DEMO[BRTHDAT_RAW]', ''),
            'deceased': record.get('DEMO[DTHDAT_RAW]', ''),
            'father': record.get('CORE[FPT_ID3]', ''),
            'mother': record.get('CORE[MPT_ID3]', ''),
            'demographics': self._extract_demographics(record),
            'partners': [],
            'diseases': [],
            'procedures': []
        }

        return person_id, person_data

    def _extract_demographics(self, record: Dict[str, Any]) -> Dict[str, Any]:
        """Extract demographic information from record."""
        return {
            'gender': record.get('DEMO[SEX_OLD]', '')
        }

    def _extract_partner_data(self, record: Dict[str, Any]) -> Dict[str, Any]:
        """Extract partner/spouse information from record."""
        return {
            'spouse_id': record.get('CORE[Value]', ''),
            'spouse_num': record.get('CORE[SPOUSE Num]', '')
        }

    def _extract_cancer_disease(self, record: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Extract cancer disease information from record."""
        code = record.get('Subject_cancer[CANCER.ICD03]', '')
        if not code:
            return None

        disease_num = record.get('Subject_cancer[CANCER.NUM]', '')
        med_code, shorthand = self._parse_medical_code(code)

        return {
            'shorthand': shorthand,
            'code': med_code,
            'laterality': str(record.get('Subject_cancer[CANCER.PRM_TUMOR_LATERAL_TP_STD]', '')),
            'diagnosis_method': record.get('Subject_cancer[CANCER.PATH_ACQ_METH_TP]', ''),
            'age_of_diagnosis': str(record.get('Subject_cancer[CANCER.AGE_AT_DIAGNOSIS]', '')),
            'date_of_diagnosis': record.get('Subject_cancer[CANCER.DX_DT]', ''),
            'd_num': f"C{disease_num}" if disease_num else ''
        }

    def _extract_non_cancer_disease(self, record: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Extract non-cancer disease information from record."""
        code = record.get('Subject non cancer[N_CANCER.CD10_CD]', '')
        if not code:
            return None

        disease_num = record.get('Subject non cancer[N_CANCER.NUMBER]', '')

        return {
            'shorthand': code,
            'code': code,
            'laterality': str(record.get('Subject non cancer[N_CANCER.PRM_TUMOR_LATERAL_TP_STD]', '')),
            'diagnosis_method': record.get('Subject non cancer[N_CANCER.TBD]', ''),
            'age_of_diagnosis': str(record.get('Subject non cancer[N_CANCER.AGE_AT_DIAGNOSIS]', '')),
            'date_of_diagnosis': record.get('Subject non cancer[N_CANCER.BX_DT]', ''),
            'd_num': f"D{disease_num}" if disease_num else ''
        }

    def _extract_procedure(self, record: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Extract procedure information from record."""
        code = record.get('Subject procedure[PRTRT.ICD_9_STD]', '')
        if not code:
            return None

        proc_num = record.get('Subject procedure[PRTRT.NUMBER]', '')

        return {
            'shorthand': code,
            'code': code,
            'age_at_procedure': record.get('Subject procedure[PRTRT.DERIV_PRSN_AGE]', ''),
            'date_of_procedure': record.get('Subject procedure[PRTRT.PRSTDAT]', ''),
            'proc_num': f"P{proc_num}" if proc_num else ''
        }

    def _add_unique_item(self, items_list: List[Dict], new_item: Dict,
                         unique_key: str) -> None:
        """
        Add item to list if it doesn't already exist based on unique key.

        Args:
            items_list: List to add item to
            new_item: Item to potentially add
            unique_key: Key to check for uniqueness
        """
        if not any(item.get(unique_key) == new_item.get(unique_key)
                   for item in items_list):
            items_list.append(new_item)

    def _parse_medical_code(self, text):
        """
        Parse medical diagnostic code text to extract the code and title.

        Args:
            text (str): Input text in format "CODE - TITLE"

        Returns:
            tuple: (code, title) or (None, None) if no match
        """
        # Regular expression pattern to match code and title
        # Pattern explanation:
        # ^         - Start of string
        # ([A-Z]\d+(?:\.\d+)?) - Capture group 1: Letter followed by digits, optionally with decimal
        # \s*-\s*   - Dash with optional whitespace on both sides
        # (.+)      - Capture group 2: Everything else (the title)
        # $         - End of string
        pattern = r'^([A-Z]\d+(?:\.\d+)?)\s*-\s*(.+)$'

        match = re.match(pattern, text.strip())
        if match:
            code = match.group(1)
            title = match.group(2).strip()
            return code, title
        else:
            return None, None

    def process_records(self, records: List[Dict[str, Any]]) -> None:
        """
        Process a list of medical records and organize by person.

        Args:
            records: List of medical record dictionaries

        Raises:
            ValueError: If records are invalid or missing required fields
        """
        if not records:
            raise ValueError("No records provided for processing")

        # Set study, proband, family classification, and family genetic status as the first person in the input file
        try:
            self.general["study"] = records[0]['Merge1[project]']
            print(f"[INFO] Processing study: {self.general['study']}")
        except (KeyError, IndexError):
            raise ValueError("Cannot determine proband from first record")
        try:
            self.general["proband"] = records[0]['Merge1[Subject]']
            #self.proband = self.general["proband"] #records[0]['Merge1[Subject]']
            print(f"[INFO] Processing proband: {self.general['proband']}")
        except (KeyError, IndexError):
            raise ValueError("Cannot determine proband from first record")
        try:
            self.general["family_classification"] = records[0]['Append Genetic status[result.family_classification]']
            print(f"[INFO] Processing family classification: {self.general['family_classification']}")
        except (KeyError, IndexError):
            self.general["family_classification"] = "NO-FAMILY-CLASSIFICATION"
            print(f"[WARNING] Cannot determine family classification from first record")
            #raise ValueError("Cannot determine family classification from first record")
        try:
            self.general["family_genetic_status"] = records[0]['Append Genetic status[result.family_genetic_status]']
            print(f"[INFO] Processing family genetic status: {self.general['family_genetic_status']}")
        except (KeyError, IndexError):
            self.general["family_genetic_status"] = "NO-FAMILY-GENETIC-STATUS"
            print(f"[WARNING] Cannot determine family genetic status from first record")
            #raise ValueError("Cannot determine family genetic status from first record")

        # Process each record
        for i, record in enumerate(records):
            try:
                person_id, person_data = self.extract_person_data(record)

                # Initialize person if not exists
                if person_id not in self.people:
                    self.people[person_id] = person_data

                # Add partner information
                partner_data = self._extract_partner_data(record)
                if partner_data.get('spouse_num'):
                    self._add_unique_item(
                        self.people[person_id]['partners'],
                        partner_data,
                        'spouse_num'
                    )

                # Add cancer disease if present
                cancer_disease = self._extract_cancer_disease(record)
                if cancer_disease and cancer_disease.get('d_num'):
                    self._add_unique_item(
                        self.people[person_id]['diseases'],
                        cancer_disease,
                        'd_num'
                    )

                # Add non-cancer disease if present
                non_cancer_disease = self._extract_non_cancer_disease(record)
                if non_cancer_disease and non_cancer_disease.get('d_num'):
                    self._add_unique_item(
                        self.people[person_id]['diseases'],
                        non_cancer_disease,
                        'd_num'
                    )

                # Add procedure if present
                procedure = self._extract_procedure(record)
                if procedure and procedure.get('proc_num'):
                    self._add_unique_item(
                        self.people[person_id]['procedures'],
                        procedure,
                        'proc_num'
                    )

            except Exception as e:
                print(f"[WARNING] Error processing record {i}: {e}")
                continue

        # clean up so empty records are not present (thus reducing file-size)
        if True: # compress
            for person_id, person_data in self.people.items():
                try:
                    # clear out empty records (e.g., deceased)
                    self.people[person_id] = {k: v for k, v in person_data.items() if v not in (None, '', [], {}, ())}
                except Exception as e:
                    print(f"[WARNING] Error cleaning record {person_id}: {e}")
                    continue

    def get_output_data(self) -> Dict[str, Any]:
        """
        Get the processed data in the final output format.

        Returns:
            Dictionary with proband and people data
        """
        # generate updated last datetime stamp (in ISO 8601 formatted string)
        self.general["last_updated"] = datetime.now().isoformat()

        return {
            #'proband': self.proband,
            'general': dict(self.general),
            'people': dict(self.people)  # Convert defaultdict to regular dict
        }

def parse_json(file_path: str) -> Optional[Dict[str, Any]]:
    """
    Load and parse a JSON file.

    Args:
        file_path (str): Path to the JSON file.

    Returns:
         dict or None: Parse JSON object, or None if an error occurred.
    """
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except json.JSONDecodeError as e:
        print(f"[Error] Failed to decode JSON: {e}")
    except UnicodeDecodeError as e:
        print(f"[Error] Encoding issue: {e}")
    except FileNotFoundError as e:
        print(f"[Error] File not found: {e}")
    except Exception as e:
        print(f"[Error] Unexpected error: {e}")
    return None

def write_json_to_file(data: Dict[str, Any], output_path: str, indent: int = 2) -> None:
    """
    Write a JSON object to a file with pretty formatting.

    :param data: JSON-serializable object.
    :param output_path: Output file path.
    :param indent: Indentation level for pretty-printing
    :return:
    """
    try:
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=indent)
        print(f"[Info] JSON written to {output_path}")
    except Exception as e:
        print(f"[Error] Failed to write JSON: {e}")

def build_friendly_json_file(json_obj: Dict[str, Any], output_path: str) -> None:
    """
    Alias for writing a single JSON object with pretty formatting

    Args:
         json_obj (dict): JSON content.
         output_path (str): Destination file path.
    """
    write_json_to_file(json_obj, output_path)

def build_json_file(proband: str, general: Dict[str, str], people: Dict[str, Any], output_path: str, indent: int = 2) -> None:
    d = defaultdict(dict)
    #d['proband'] = proband
    d['general'] = general
    d['people'] = people

    with open(output_path, 'w', encoding = 'utf-8') as jsonf:
        jsonString = json.dumps(d, indent = indent)
        jsonf.write(jsonString)
    print(f"[Info] JSON written to {output_path}")

# Optional main section for command-line execution
def main():
    if len(sys.argv) != 5:
        print("Usage: python json2json.py <directory> <input_file> <reference_file> <output_file>")
        print("  directory: Base directory containing input files")
        print("  input_file: Original input JSON file")
        print("  reference_file: Reference output JSON file")
        print("  output_file: New output JSON file to create")
        sys.exit(1)

    try:
        # Parse command line arguments
        base_dir, input_file, reference_file, output_file = sys.argv[1:5]
        base_path = Path(base_dir)

        # Construct file paths
        input_path = base_path / "raw/" / input_file
        reference_path = base_path / "formatted/" / reference_file
        #output_path = Path.cwd() / output_file
        output_path = base_path / "processed/" / output_file

        print(f"[INFO] Base directory: {base_path}")
        print(f"[INFO] Input file: {input_path}")
        print(f"[INFO] Reference file: {reference_path}")
        print(f"[INFO] Output file: {output_path}")

        # Initialize processor
        processor = JSONProcessor()

        # Load input data
        input_data = processor.load_json(input_path)
        if not isinstance(input_data, list):
            raise ValueError("Input JSON must be a list of records")

        # Load reference data (for debugging/comparison)
        try:
            reference_data = processor.load_json(reference_path)
            # Save formatted copies for debugging
            processor.save_json(input_data, base_path / "debug/" / "debug_input.json")
            processor.save_json(reference_data, base_path / "debug/" / "debug_reference.json")
        except Exception as e:
            print(f"[WARNING] Could not load reference file: {e}")

        # Process the records
        processor.process_records(input_data)

        # Generate and save output
        output_data = processor.get_output_data()
        processor.save_json(output_data, output_path)

        # Print summary
        print(f"[INFO] Processing complete!")
        print(f"[INFO] Processed {len(input_data)} records")
        print(f"[INFO] Generated data for {len(processor.people)} people")
        #print(f"[INFO] Proband: {processor.proband}")

    except Exception as e:
        print(f"[ERROR] Processing failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
