# Módulo Gestoría

Módulo sectorial activo por defecto para la demo del motor de suscripciones.

## Funcionalidad

- Incluye cuatro herramientas gratuitas de captación, disponibles sin suscripción: calculadora de sueldo neto, calculadora de cuota de autónomos, simulador IVA/IRPF trimestral y calendario fiscal orientativo.
- El usuario sube y consulta documentación. El límite es de 2 MB en Básico y 250 MB en Premium.
- Puede consultar disponibilidad, solicitar, modificar y cancelar citas seleccionando gestor y modalidad.
- La agenda usa un adaptador local de demostración; el contrato permite sustituirlo por el ERP o scheduler corporativo.
- Recibe recordatorios internos cercanos a la cita.
- Envía y recibe mensajes clasificados por tipo, puede marcarlos como leídos y responderlos.
- Consulta notificaciones clasificadas por tipo y puede marcarlas como leídas.
- Consulta el estado, progreso y resultado de sus trámites.
- En Premium puede enviar solicitudes laborales de vacaciones, altas, incidencias y nóminas.
- Usa un chatbot Premium en modo simulado, preparado para conectar un proveedor IA.
- El backoffice permite CRUD de documentos, citas, mensajes, notificaciones, trámites y solicitudes laborales, y consulta las sesiones del chatbot.

## Desarrollo local

```bash
cd /Users/rafa_penya/Documents/GitHub/subscription-system
APP_ENV=development \
APP_VERTICAL_MODULE=gestoria \
LOCAL_DATABASE_PATH=./data/gestoria.sqlite3 \
LOCAL_FILE_STORAGE_PATH=./data/gestoria-files \
uvicorn --app-dir services/api app.main:app --reload --port 8000
```

En desarrollo el panel de Gestoría se abre directamente desde el backoffice local. No se solicita un token para activar el módulo. Fuera de desarrollo se mantiene protección administrativa en las rutas del módulo; la integración definitiva será mediante usuario admin y roles, no mediante un selector de módulo.

El proveedor de agenda se selecciona con `GESTORIA_SCHEDULER_PROVIDER=local`. `local` es la agenda de demo; `corporate` deja explícita la integración pendiente con el ERP del cliente y devuelve un estado no configurado hasta implementar el adaptador.

La persistencia sectorial pasa por `backend/erp.py`. `GESTORIA_ERP_PROVIDER=local` registra enlaces locales de sincronización; `corporate` deja las entidades en estado pendiente hasta implementar el conector del ERP del comprador. El contrato cubre documentos, citas, mensajes, notificaciones, trámites, solicitudes laborales, perfiles y conversaciones del chatbot.
