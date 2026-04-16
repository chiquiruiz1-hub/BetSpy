import os
import requests
from dotenv import load_dotenv

load_dotenv()
API_KEY = os.getenv('THE_ODDS_API_KEY')
print(f"API Key found: {API_KEY is not None}")
if API_KEY:
    print(f"API Key length: {len(API_KEY)}")
    print(f"Starts with: {API_KEY[:4]}... Ends with: {API_KEY[-4:]}")

BASE_URL = 'https://api.the-odds-api.com/v4'

def test():
    url = f'{BASE_URL}/sports/?apiKey={API_KEY}'
    r = requests.get(url)
    if r.status_code == 200:
        sports = r.json()
        keys = [s['key'] for s in sports]
        print(f"NBA in list: {'basketball_nba' in keys}")
        print(f"La Liga in list: {'soccer_spain_la_liga' in keys}")
        
        # Test NBA odds
        if 'basketball_nba' in keys:
            print("\nTesting NBA odds...")
            url_odds = f'{BASE_URL}/sports/basketball_nba/odds/?apiKey={API_KEY}&regions=us&oddsFormat=decimal'
            r_odds = requests.get(url_odds)
            if r_odds.status_code == 200:
                odds = r_odds.json()
                print(f"NBA matches found: {len(odds)}")
                if odds:
                    print(f"First match bookmakers: {len(odds[0]['bookmakers'])}")
            else:
                print(f"Odds API Error {r_odds.status_code}: {r_odds.text}")
    else:
        print(f"Error {r.status_code}: {r.text}")

if __name__ == "__main__":
    test()
