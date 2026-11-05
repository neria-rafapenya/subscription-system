# Entornos y configuración

## Development

El entorno de desarrollo es completamente local:

- SQLite para la base de datos.
- Sistema de archivos local para documentos.
- Imágenes y archivos adjuntos de servicios en `data/files/services`.
- Autenticación local controlada por `LOCAL_AUTH_ENABLED`.
- Simulador de pago integrado en la app para probar el circuito completo sin AWS ni PayPal externo.
- No se ejecuta Terraform ni se realizan llamadas AWS.

La configuración se carga desde `.env` local y nunca se sube al repositorio.

El login local de la primera demo utiliza `demo@example.test` / `demo`. Estas credenciales solo sirven para `development` y se sustituirán por Cognito en los otros entornos.

## Integration

Integración utiliza AWS real con límites de uso:

- Cognito de integración.
- API Gateway y Lambda de integración.
- DynamoDB bajo demanda con datos de prueba.
- S3 privado de integración.
- Imágenes y adjuntos de servicios en un bucket S3 privado.
- Secrets Manager para las credenciales de PayPal Sandbox y secretos técnicos.
- Presupuesto y alertas de gasto.

El backend recibe `APP_ENV=integration` mediante la configuración del despliegue. Las credenciales no se incorporan al bundle móvil ni al código fuente.

En `integration`, `PAYPAL_BASE_URL` es `https://api-m.sandbox.paypal.com` y las credenciales pertenecen al comercio Sandbox. En `production`, `PAYPAL_BASE_URL` debe ser `https://api-m.paypal.com` con las credenciales reales del cliente.

### Integration local con PayPal Sandbox

Antes de desplegar AWS, `integration` puede ejecutarse en localhost con una base y almacenamiento separados. En esta modalidad se utiliza PayPal Sandbox y `SECRETS_MANAGER_ENABLED=false`; al desplegar la cuenta AWS se cambia a `SECRETS_MANAGER_ENABLED=true` y se usan las credenciales Sandbox del secreto de integración correspondiente.

## Production

Producción tendrá una cuenta o ecosistema AWS separado, datos reales, secretos propios del cliente y una política de copias, retención, monitorización y soporte aprobada.

## Configuración frente a secretos

La configuración no sensible puede viajar como variables de entorno:

- nombre del entorno;
- URL pública de API;
- región AWS;
- identificadores públicos de Cognito;
- flags de funcionalidad.

Todos los secretos de cada entorno se centralizarán en un único secreto lógico de AWS Secrets Manager, por ejemplo:

```text
subscription-system/integration/application
subscription-system/production/application
```

Ese secreto podrá contener secciones por proveedor, manteniendo un único punto de gestión y rotación:

```json
{
  "paypal": {
    "client_id": "...",
    "client_secret": "...",
    "webhook_id": "..."
  },
  "redsys": {
    "merchant_code": "...",
    "secret_key": "..."
  },
  "corporate_integrations": {}
}
```

Dentro de Secrets Manager vivirán:

- secreto de PayPal;
- credenciales Redsys o banca;
- claves privadas de webhooks;
- credenciales de integraciones corporativas;
- claves de cifrado o tokens de proveedores.

Las credenciales AWS no se guardarán como `AWS_ACCESS_KEY_ID` y `AWS_SECRET_ACCESS_KEY`. En integración y producción se utilizarán roles IAM asociados a Lambda, ECS u otro servicio de ejecución. Solo el nombre/ARN del secreto y la región serán configuración no sensible.

El backend obtiene el secreto centralizado usando un rol IAM y puede cachearlo temporalmente en memoria. El frontend solo recibe identificadores públicos y nunca recibe secretos de proveedores de pago.

## Alta y recuperación de usuarios

En `development`, el alta y la recuperación se gestionan localmente:

- las contraseñas se almacenan únicamente como hashes PBKDF2;
- el alta no crea ninguna suscripción;
- la recuperación genera un token de un solo uso con caducidad de 30 minutos;
- como todavía no hay correo local, el token se muestra en la propia demo.

En `integration` y `production`, `LOCAL_AUTH_ENABLED` estará desactivado. La aplicación conservará el mismo contrato de usuario, pero el adaptador de autenticación deberá delegar el alta, login, verificación y recuperación en Cognito. Los tokens de Cognito sustituirán al token local y el backend asociará cada checkout y consulta al `sub` autenticado.

## Circuito de suscripción

La aplicación no crea una suscripción al pulsar el botón de un plan. El flujo es:

1. Crear una sesión de checkout.
2. Completar o aprobar el checkout con el proveedor de pagos.
3. Crear la suscripción local en estado `active` cuando el checkout haya sido confirmado.
4. No permitir otra suscripción abierta para el mismo usuario mientras la actual siga vigente.
5. Mantener la renovación automática si el precio contratado no ha cambiado.
6. Si el usuario cancela, conservar el acceso hasta `current_period_end` y desactivar la renovación.
7. Mantener los cambios posteriores mediante webhooks y reglas del proveedor.

En `development`, el proveedor es `local` y el checkout se simula dentro de la aplicación; el backend también simula el vencimiento y la renovación al abrir la base local. En `integration`, el proveedor será PayPal Sandbox y el backend usará sus credenciales y webhooks de prueba. En `production`, usará PayPal real, las credenciales del cliente y sus webhooks. Las credenciales nunca se entregarán al cliente móvil/web.

## Servicios y niveles de suscripción

Cada servicio se clasifica con `minimum_tier = basic` o `premium`. El valor predeterminado es `basic`. Una suscripción básica incluye todos los servicios básicos; una suscripción premium incluye los básicos y los premium. El backoffice gestiona esta clasificación y la aplicación cliente recibe el catálogo con el indicador de inclusión según la suscripción activa del usuario.

## Reiniciar los datos de desarrollo

La base local se conserva entre arranques. Si se quiere comenzar la demo desde cero, hay que detener FastAPI y eliminar únicamente:

```text
data/development.sqlite3
```

No se debe ejecutar este reinicio sobre integración o producción.
