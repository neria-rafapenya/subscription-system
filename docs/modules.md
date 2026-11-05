# Módulos sectoriales

El repositorio separa el motor común de suscripciones del catálogo que representa el negocio del comprador. El backend carga un manifiesto JSON desde `modules/<id>/manifest.json`; la aplicación cliente y el backoffice siguen siendo genéricos.

## Módulos incluidos

- `maintenance`: demo original de mantenimiento.
- `gestoria`: contabilidad, fiscalidad, laboral y consultas prioritarias.
- `bufete`: consultas jurídicas, revisión documental, plazos y atención prioritaria.

Cada manifiesto define:

- `id`, `display_name`, `description` y `module_version`.
- `services`: catálogo de servicios con `id`, `name`, `description` y `minimum_tier` (`basic` o `premium`).
- `plans`: planes con `id`, nombre, descripción, importe en céntimos, moneda, intervalo y nivel.

Premium incluye automáticamente los servicios de nivel básico porque esa regla pertenece al motor común, no al módulo.

## Intercambiar módulos en local

El módulo se selecciona antes de arrancar FastAPI:

```bash
cd /Users/rafa_penya/Documents/GitHub/subscription-system
APP_ENV=development APP_VERTICAL_MODULE=gestoria \
LOCAL_DATABASE_PATH=./data/gestoria.sqlite3 \
uvicorn --app-dir services/api app.main:app --reload --port 8000
```

Para probar el bufete:

```bash
APP_ENV=development APP_VERTICAL_MODULE=bufete \
LOCAL_DATABASE_PATH=./data/bufete.sqlite3 \
uvicorn --app-dir services/api app.main:app --reload --port 8000
```

Se recomienda una base local distinta por módulo. Así no se mezclan los catálogos de dos demos ni se reutilizan accidentalmente suscripciones, checkouts o precios. En AWS esto ocurre de forma natural porque cada cliente tiene su propio ecosistema y su propia base.

También puede fijarse la selección en `.env`:

```dotenv
APP_ENV=development
APP_VERTICAL_MODULE=gestoria
LOCAL_DATABASE_PATH=./data/gestoria.sqlite3
```

Después hay que reiniciar el backend y recargar cliente y backoffice. Ambos mostrarán el módulo activo en su cabecera y consumirán sus servicios y planes.

## Añadir un futuro sector

1. Crear `modules/nuevo-sector/manifest.json` siguiendo uno de los manifiestos existentes.
2. Usar IDs propios para sus servicios y planes; no reutilizar IDs de otro sector.
3. Elegir una base de datos separada para la demo.
4. Arrancar con `APP_VERTICAL_MODULE=nuevo-sector`.
5. Validar el catálogo, los precios y el circuito de pago antes de desplegar.

No es necesario modificar `services/api/app`, `apps/client` ni `apps/backoffice` para este caso. Si el sector necesita reglas de negocio que no caben en el contrato común, se tratará como una extensión explícita y se revisará antes de incorporarla.

## PayPal por módulo

Los IDs de planes de PayPal siguen siendo credenciales/configuración de entorno y no se guardan en los manifiestos. Al probar un módulo con PayPal Sandbox, `PAYPAL_BASIC_PLAN_ID` y `PAYPAL_PREMIUM_PLAN_ID` deben corresponder a los planes de ese módulo. En producción esos valores se leerán desde el secreto del cliente en AWS Secrets Manager.
