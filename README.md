# BetSpy Pro - Professional Betting Tracker

BetSpy Pro es una plataforma de auditoría de apuestas en tiempo real diseñada para profesionales. Utiliza **The Odds API (V4)** para obtener cuotas veraces de las principales casas de apuestas y detectar ineficiencias en el mercado.

## 🚀 Características
- **Datos Veraces**: Conexión directa con The Odds API.
- **UI Premium**: Interfaz dark-mode de alta fidelidad optimizada para escritorio.
- **Filtros Inteligentes**: Clasificación por deportes (Fútbol, NBA, Tenis).
- **Margen de Beneficio**: Cálculo en tiempo real de márgenes y ROI.

## 🛠️ Tecnologías
- **Frontend**: React 19 + Vite + Tailwind CSS 4.
- **Animaciones**: Framer Motion.
- **Iconos**: Lucide React.
- **Backend (Python)**: Scraper motorizado con `requests` y `python-dotenv`.

## ⚙️ Configuración

1. **Clonar y descargar dependencias**:
   ```bash
   npm install
   ```

2. **Configurar API Key**:
   Crea un archivo `.env` en la raíz con tu clave:
   ```env
   THE_ODDS_API_KEY=tu_api_key_aqui
   ```

3. **Actualizar Datos**:
   Ejecuta el scraper para refrescar las señales:
   ```bash
   python tracker.py
   ```

4. **Lanzar Dashboard**:
   ```bash
   npm run dev
   ```

## ⚠️ Nota sobre Créditos API
Si el scraper no devuelve datos y recibes un error 401 (Quota reached), es porque has agotado tus créditos gratuitos mensuales. La aplicación cargará automáticamente los últimos datos verificados guardados en `src/data/signals.json` para mantener la operatividad.

---
*Desarrollado con ❤️ para apostadores de élite.*
