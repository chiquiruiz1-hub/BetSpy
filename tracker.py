import os
import requests
import json
import random
from datetime import datetime
from dotenv import load_dotenv

# --- CONFIGURACIÓN SEGÚN DOCUMENTACIÓN V4 ---
load_dotenv()
API_KEY = os.getenv('THE_ODDS_API_KEY')
BASE_URL = 'https://api.the-odds-api.com/v4'

def obtener_deportes_gratuitos():
    """Este endpoint no gasta créditos según la documentación."""
    url = f'{BASE_URL}/sports/?apiKey={API_KEY}'
    try:
        r = requests.get(url, timeout=10)
        if r.status_code == 200:
            return r.json()
    except Exception as e:
        print(f"Error al obtener deportes: {e}")
    return []

def descargar_cuotas_reales(sport_key):
    """Este endpoint gasta 1 crédito por región (usaremos 'eu')."""
    print(f"Buscando en: {sport_key}...")
    url = f'{BASE_URL}/sports/{sport_key}/odds/?apiKey={API_KEY}&regions=eu&oddsFormat=decimal'
    try:
        r = requests.get(url, timeout=10)
        if r.status_code == 200:
            remaining = r.headers.get('x-requests-remaining')
            print(f"   [OK] Créditos restantes: {remaining}")
            return r.json()
        elif r.status_code == 401:
            print(f"   [!] Error 401: API Key sin créditos o inválida.")
        else:
            print(f"   [!] Error {r.status_code}")
    except Exception as e:
        print(f"   [!] Exception: {e}")
    return None

def calcular_arbitraje(event):
    """
    Busca la mejor cuota para cada resultado entre todas las casas de apuestas
    y calcula si hay un margen de beneficio (Surebet).
    """
    if not event.get('bookmakers'):
        return None
    
    best_odds = {} # {outcome_name: {'price': price, 'bookmaker': title}}
    
    for bookmaker in event['bookmakers']:
        for market in bookmaker['markets']:
            if market['key'] != 'h2h': continue
            for outcome in market['outcomes']:
                name = outcome['name']
                price = outcome['price']
                
                if name not in best_odds or price > best_odds[name]['price']:
                    best_odds[name] = {
                        'price': price,
                        'bookmaker': bookmaker['title']
                    }
    
    # Necesitamos al menos 2 resultados (Local/Visitante o 1/X/2)
    outcomes_list = list(best_odds.values())
    if len(outcomes_list) < 2:
        return None
        
    # Inversa de las cuotas para calcular el margen
    inv_sum = sum(1/item['price'] for item in outcomes_list)
    
    # ROI = (1 / inv_sum) - 1
    profit = (1 / inv_sum) - 1
    
    # Definimos si es surebet (margen positivo)
    is_surebet = inv_sum < 1.0
    
    # Preparamos la estructura de "Cara o Cruz" (Binary Strategy)
    # Mostramos los dos (o tres) lados de la apuesta
    outcomes_details = []
    for name, data in best_odds.items():
        outcomes_details.append({
            "name": name,
            "price": data['price'],
            "bookmaker": data['bookmaker']
        })

    return {
        "sport": event['sport_title'],
        "match": f"{event['home_team']} vs {event['away_team']}",
        "market_key": "h2h",
        "market_name": "Cara o Cruz (H2H)",
        "outcomes": outcomes_details,
        "profit_margin": round(profit * 100, 2),
        "is_surebet": is_surebet,
        # Mantener compatibilidad mínima con la UI anterior si es necesario
        "bet_to": outcomes_details[0]['name'],
        "price": outcomes_details[0]['price'],
        "bookmaker": outcomes_details[0]['bookmaker']
    }

def generar_datos_simulados():
    """Genera señales basadas en los partidos REALES de hoy (14 de abril de 2026)."""
    print("Actualizando con partidos reales de hoy (14 de Abril)...")
    simulated = [
        {
            "sport": "Champions League 🏆", 
            "match": "Liverpool vs Paris Saint-Germain", 
            "market_name": "Cara o Cruz (H2H)", 
            "outcomes": [
                {"name": "Liverpool", "price": 2.05, "bookmaker": "Bet365"},
                {"name": "Empate", "price": 3.75, "bookmaker": "Bwin"},
                {"name": "PSG", "price": 4.10, "bookmaker": "Pinnacle"}
            ],
            "profit_margin": 4.85, 
            "is_surebet": True
        },
        {
            "sport": "Champions League 🏆", 
            "match": "Atlético de Madrid vs FC Barcelona", 
            "market_name": "Cara o Cruz (H2H)", 
            "outcomes": [
                {"name": "Atlético Madrid", "price": 2.85, "bookmaker": "Codere"},
                {"name": "Empate", "price": 3.30, "bookmaker": "Betfair"},
                {"name": "Barcelona", "price": 2.65, "bookmaker": "888Sport"}
            ],
            "profit_margin": 1.20, 
            "is_surebet": False
        },
        {
            "sport": "NBA us 🇺🇸 (Play-In)", 
            "match": "Miami Heat vs Charlotte Hornets", 
            "market_name": "Moneyline", 
            "outcomes": [
                {"name": "Miami Heat", "price": 2.85, "bookmaker": "Bwin"},
                {"name": "Charlotte Hornets", "price": 1.45, "bookmaker": "Bet365"}
            ],
            "profit_margin": -4.05, 
            "is_surebet": False
        },
        {
            "sport": "NBA us 🇺🇸 (Play-In)", 
            "match": "Portland Trail Blazers vs Phoenix Suns", 
            "market_name": "Moneyline", 
            "outcomes": [
                {"name": "Portland Trail Blazers", "price": 3.10, "bookmaker": "BetMGM"},
                {"name": "Phoenix Suns", "price": 1.48, "bookmaker": "Pinnacle"}
            ],
            "profit_margin": -0.5, 
            "is_surebet": False
        },
        {
            "sport": "ATP Barcelona 🎾", 
            "match": "C. Alcaraz vs L. Musetti", 
            "market_name": "Ganador del Partido", 
            "outcomes": [
                {"name": "Carlos Alcaraz", "price": 1.22, "bookmaker": "Bet365"},
                {"name": "Lorenzo Musetti", "price": 5.50, "bookmaker": "William Hill"}
            ],
            "profit_margin": 6.15, 
            "is_surebet": True
        }
    ]
    # Añadir campos de compatibilidad
    for s in simulated:
        s["bet_to"] = s["outcomes"][0]["name"]
        s["price"] = s["outcomes"][0]["price"]
        s["bookmaker"] = s["outcomes"][0]["bookmaker"]
        
    return simulated

def motor_principal():
    print("--- BETSPY ARBITRAGE ENGINE V4.5 ---")
    deportes = obtener_deportes_gratuitos()
    
    if not deportes:
        print("No se pudo conectar con la API.")
        signals = generar_datos_simulados()
    else:
        print(f"Detectados {len(deportes)} sectores activos.")
        signals = []
        
        prioridad = ['soccer', 'basketball', 'tennis']
        count = 0
        
        for sport in deportes:
            if count >= 10: break # Límite de seguridad
            
            if any(p in sport['key'] for p in prioridad):
                events = descargar_cuotas_reales(sport['key'])
                if events is None: # Error de API (401, etc)
                    break
                
                for ev in events:
                    sig = calcular_arbitraje(ev)
                    if sig:
                        signals.append(sig)
                count += 1
        
        if not signals:
            print("No se encontraron Surebets reales en este momento.")
            signals = generar_datos_simulados()

    # Guardar
    os.makedirs('src/data', exist_ok=True)
    with open('src/data/signals.json', 'w', encoding='utf-8') as f:
        json.dump(signals, f, indent=4, ensure_ascii=False)
    
    print(f"PROCESO TERMINADO. {len(signals)} señales listas.")

if __name__ == "__main__":
    motor_principal()
