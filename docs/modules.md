# Módulos sectoriales

El repositorio separa el motor común de suscripciones del catálogo que representa el negocio del comprador. El backend carga un manifiesto JSON desde `modules/<id>/manifest.json`; la aplicación cliente y el backoffice siguen siendo genéricos.

## Módulos incluidos

- `maintenance`: demo original de mantenimiento.
- `gestoria`: documentos, citas, mensajes, notificaciones y chatbot IA de demostración.
- `bufete`: consultas jurídicas, revisión documental, plazos y atención prioritaria.

Cada manifiesto define:

- `id`, `display_name`, `description` y `module_version`.
- `services`: catálogo de servicios con `id`, `name`, `description` y `minimum_tier` (`free`, `basic` o `premium`). Los servicios `free` no requieren suscripción.
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

Para módulos basados únicamente en manifiesto no es necesario modificar el núcleo. Los plugins backend y backoffice se descubren desde el directorio `modules`; las extensiones de cliente se asocian mediante el registro de compilación de Expo, porque React Native necesita conocer sus componentes al empaquetar. Si el sector necesita reglas de negocio que no caben en el contrato común, se tratará como una extensión explícita y se revisará antes de incorporarla.

## Backoffice de Gestoría

El módulo activo por defecto es `gestoria` y su backoffice se carga automáticamente desde `modules/gestoria/backoffice/index.jsx`. En desarrollo local aparece directamente, sin pantalla para introducir un token de activación del módulo. El panel permite administrar clientes y realizar CRUD de documentos, citas, mensajes y notificaciones, además de consultar las sesiones del chatbot.

Esto no significa que el backend quede abierto al publicar la aplicación: en `integration` y `production` las rutas sectoriales exigen autenticación administrativa. La futura sustitución será un usuario admin con Cognito/RBAC, no un token de selección de módulo.

## Plugins sectoriales

Un módulo puede incluir lógica propia además del manifiesto. El contrato actual permite:

```text
modules/<id>/
├── backend/plugin.py       rutas, tablas y reglas del módulo
├── backend/schema.sql      esquema propio del módulo
├── client/                 pantallas de la aplicación cliente
└── backoffice/index.jsx    panel sectorial del backoffice
```

El backend común carga automáticamente `backend/plugin.py` si el manifiesto lo declara. El backoffice común descubre automáticamente `backoffice/index.jsx`. El cliente utiliza un adaptador visual común para que el código de la extensión siga dentro del módulo y sea compatible con Expo Web y móvil.

## Módulo Gestoría

`modules/gestoria` es el módulo sectorial activo de referencia. Incluye:

- subida y consulta de documentación desde la aplicación y el backoffice;
- agenda de citas con disponibilidad, modificación, cancelación y recordatorios;
- adaptador de agenda local preparado para conectarse a un ERP o scheduler corporativo;
- mensajes y notificaciones por tipo, lectura y respuesta;
- estado y progreso de trámites, con resultado cuando esté disponible;
- solicitudes laborales de vacaciones, altas, incidencias y nóminas;
- herramientas gratuitas de captación: sueldo neto, cuota de autónomos, simulador IVA/IRPF trimestral y calendario fiscal orientativo;
- límites de documentos de 2 MB en Básico y 250 MB en Premium;
- contrato ERP común para vincular toda la información persistente del módulo;
- chatbot Premium en modo simulado, listo para conectar un proveedor LLM;
- tablas propias y almacenamiento bajo el directorio del módulo.

Todas sus rutas quedan bajo `/modules/gestoria`. La aplicación cliente muestra la extensión del módulo activo y el backoffice carga su panel especializado.

## Módulo Sanidad

`modules/sanidad` es el primer ejemplo de módulo con lógica propia. Incluye:

- documentos privados con almacenamiento local en desarrollo y ruta preparada para S3;
- médicos de demostración, citas, modalidad y recordatorios de 48 horas y 2 horas;
- perfiles sanitarios, informes y diagnósticos;
- mensajes entre paciente y centro;
- chatbot en modo simulado, preparado para conectar posteriormente un proveedor LLM;
- panel de backoffice con indicadores, pacientes, documentos, citas y ficha sanitaria completa.

Los endpoints específicos quedan bajo `/modules/sanidad`. Es un módulo alternativo y conserva su protección administrativa específica.

Los datos sanitarios son especialmente sensibles. Antes de integración o producción habrá que sustituir el token local por roles de Cognito, añadir auditoría completa, cifrado y políticas de retención, además de revisar el tratamiento RGPD con asesoramiento especializado.

## PayPal por módulo

Los IDs de planes de PayPal siguen siendo credenciales/configuración de entorno y no se guardan en los manifiestos. Al probar un módulo con PayPal Sandbox, `PAYPAL_BASIC_PLAN_ID` y `PAYPAL_PREMIUM_PLAN_ID` deben corresponder a los planes de ese módulo. En producción esos valores se leerán desde el secreto del cliente en AWS Secrets Manager.
