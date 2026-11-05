# Subscription System

Motor agnóstico de suscripciones con aplicación React Native/Web, backend FastAPI y despliegue AWS gestionado con Terraform.

## Entornos

El proyecto utiliza tres entornos explícitos:

- `development`: todo local. No requiere cuenta AWS ni consume servicios AWS.
- `integration`: AWS real con recursos limitados, PayPal Sandbox y datos de prueba controlados.
- `production`: AWS separado, secretos propios del cliente y datos reales.

La variable `APP_ENV` selecciona el entorno del backend. En la aplicación móvil/web se utiliza `EXPO_PUBLIC_APP_ENV`, que se incorpora durante la compilación. En `development` se utiliza un simulador de pago integrado; `integration` usa PayPal Sandbox con cuentas compradoras de prueba y `production` PayPal real.

La variable `APP_VERTICAL_MODULE` selecciona el módulo sectorial cargado por la instalación. Actualmente están disponibles `maintenance`, `gestoria` y `bufete`. El cliente móvil y el backoffice consumen el mismo contrato genérico de servicios, planes y suscripciones; por eso el cambio de sector no requiere editar sus pantallas.

## Estructura

```text
apps/client       Aplicación React Native + React Native Web
apps/backoffice   Backoffice web local para administración
services/api      Backend FastAPI
infra/terraform   Infraestructura AWS por entorno
docs              Decisiones y procedimiento operativo
```

## Primer arranque local

Backend:

```bash
cd /Users/rafa_penya/Documents/GitHub/subscription-system
cp .env.example .env
python3 -m venv .venv
source .venv/bin/activate
pip install -r services/api/requirements.txt
APP_ENV=development uvicorn --app-dir services/api app.main:app --reload --port 8000
```

Aplicación cliente:

```bash
cd /Users/rafa_penya/Documents/GitHub/subscription-system
npm --prefix apps/client install
npm --prefix apps/client run web
```

Backoffice:

```bash
cd /Users/rafa_penya/Documents/GitHub/subscription-system
npm --prefix apps/backoffice install
npm --prefix apps/backoffice run dev
```

## Regla de secretos

Los secretos no se guardan en Git. En desarrollo se usan variables locales. En integración y producción se leerán desde AWS Secrets Manager exclusivamente desde el backend.

## Módulos sectoriales

Consulta [docs/modules.md](docs/modules.md) para añadir o intercambiar un módulo sin modificar el núcleo.
