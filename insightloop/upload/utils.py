import csv
import os
import uuid
from django.conf import settings
from django.http import HttpResponse
from io import StringIO

def export_to_csv(data, filename):
    """
    Export a list of dictionaries to a CSV file and return the URL to download it.
    
    Args:
        data (list of dict): Data to export
        filename (str): Desired filename (will be sanitized)
    
    Returns:
        str: URL to the generated CSV file
    """
    # Ensure the export directory exists
    export_dir = os.path.join(settings.MEDIA_ROOT, 'exports')
    os.makedirs(export_dir, exist_ok=True)
    
    # Generate a unique filename to avoid collisions
    safe_filename = f"{uuid.uuid4().hex}_{filename}"
    file_path = os.path.join(export_dir, safe_filename)
    
    # Write the CSV
    with open(file_path, 'w', newline='', encoding='utf-8') as csvfile:
        if data:
            fieldnames = data[0].keys()
            writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(data)
    
    # Return the URL for downloading
    return f"{settings.MEDIA_URL}exports/{safe_filename}"

def generate_csv_response(data, filename):
    """
    Generate a CSV download response directly (without saving to disk)
    
    Args:
        data (list of dict): Data to export
        filename (str): Filename for the download
    
    Returns:
        HttpResponse: CSV download response
    """
    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    
    writer = csv.writer(response)
    if data:
        # Write header
        writer.writerow(data[0].keys())
        
        # Write rows
        for item in data:
            writer.writerow(item.values())
    
    return response