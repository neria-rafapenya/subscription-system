# Módulo Sanidad

Extensión sectorial de demostración para citas, documentos, informes, mensajes y un chatbot simulado.

## Arranque local

```bash
cd /Users/rafa_penya/Documents/GitHub/subscription-system
APP_ENV=development \
APP_VERTICAL_MODULE=sanidad \
LOCAL_DATABASE_PATH=./data/sanidad.sqlite3 \
LOCAL_FILE_STORAGE_PATH=./data/sanidad-files \
uvicorn --app-dir services/api app.main:app --reload --port 8000
```

Aplicación cliente:

```bash
npm --prefix apps/client run web
```

Backoffice:

```bash
npm --prefix apps/backoffice run dev
```

El panel sanitario solicita el token administrativo al abrirse. En desarrollo, si no se define `BACKOFFICE_ADMIN_TOKEN`, el backend acepta `local-backoffice-demo`. Para integración y producción debe definirse mediante el sistema de secretos del entorno.

## Contrato funcional inicial

- El paciente puede consultar médicos, crear citas y escoger modalidad.
- Cada cita genera recordatorios internos para 48 horas y 2 horas antes.
- El paciente puede subir y consultar documentos.
- El centro puede consultar la ficha sanitaria desde el backoffice.
- El centro puede consultar documentos, citas, informes, mensajes y sesiones de chatbot.
- El chatbot responde con un proveedor simulado y no realiza diagnósticos.

La subida nativa de documentos para iOS/Android queda preparada en backend y se completará conectando un selector de archivos móvil; la versión web ya permite seleccionar archivos desde el navegador.
