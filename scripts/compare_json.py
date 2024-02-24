import requests
import json
import matplotlib.pyplot as plt

def fetch_json_data(url):
    response = requests.get(url)
    if response.status_code == 200:
        return response.json()
    else:
        print("Failed to fetch JSON data")
        return None

def analyze_recognitions(data):
    total_recognitions = data['total']
    recognitions = data['data']

    active_recognitions = sum(1 for recognition in recognitions
                              if recognition['Start Date'] <= '24/02/2024' and recognition['End Date'] >= '24/02/2024')

    descriptions_over_50 = sum(1 for recognition in recognitions if len(recognition['Description']) > 50)

    non_empty_image_urls = sum(1 for recognition in recognitions if recognition['Image URL'])

    return total_recognitions, active_recognitions, descriptions_over_50, non_empty_image_urls

def plot_data(org_name, total_recognitions, active_recognitions, descriptions_over_50, non_empty_image_urls):
    labels = ['Total Recognitions', 'Active Recognitions', 'Descriptions > 50', 'Non-empty Image URLs']
    values = [total_recognitions, active_recognitions, descriptions_over_50, non_empty_image_urls]

    plt.figure(figsize=(10, 6))
    plt.bar(labels, values, color=['blue', 'green', 'orange', 'red'])
    plt.title(f'Statistics for {org_name}')
    plt.xlabel('Categories')
    plt.ylabel('Counts')
    plt.xticks(rotation=45)
    plt.tight_layout()
    plt.savefig(f'{org_name}_statistics.png')
    plt.show()

def main():
    org_url = "https://dx-recognitions.aem-screens.net/content/screens/org-amitabh/org-anup/recognitions.json"
    data = fetch_json_data(org_url)

    if data:
        total_recognitions, active_recognitions, descriptions_over_50, non_empty_image_urls = analyze_recognitions(data)
        org_name = "org-anup"  # Change this accordingly
        plot_data(org_name, total_recognitions, active_recognitions, descriptions_over_50, non_empty_image_urls)

if __name__ == "__main__":
    main()
