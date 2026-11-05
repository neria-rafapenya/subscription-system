# Backoffice local inicial

El backoffice se mantendrá separado de la aplicación móvil. En esta primera fase se ejecutará en localhost y permitirá validar el modelo de negocio antes de desplegarlo en AWS.

## Funciones de la primera iteración

La versión actual permite:

1. Crear, consultar, editar, activar y desactivar servicios de demo.
2. Consultar los planes de suscripción.
3. Consultar las suscripciones.
4. Ver el `user_id`, nombre y correo del usuario asociado.
5. Pausar una suscripción mediante el estado `suspended`.
6. Reactivar una suscripción pausada.
7. Ver el entorno activo y el proveedor de pagos configurado.
8. Cambiar el precio de un plan con confirmación explícita y generar avisos para las suscripciones afectadas.
9. Crear, consultar y editar clientes del administrador, incluyendo nombre, correo y `cognito_sub`.
10. Eliminar clientes que todavía no tengan historial asociado.

El listado de clientes se muestra en una tabla paginada de diez registros, con nombre, correo, fecha de alta, suscripciones y acciones. La tabla permite ordenar por nombre o fecha de alta en ambos sentidos.

Desde cada fila se puede abrir un modal de detalle sin abandonar la tabla. El detalle del cliente reúne perfil, facturación, aceptación de políticas, suscripciones, checkouts y notificaciones; el detalle del servicio muestra configuración, nivel, estado, imagen y adjunto.

El catálogo de servicios se muestra en tabla e incluye carga de imagen y archivo adjunto. En desarrollo se almacenan en `data/files/services`; la base conserva sus claves y nombres para poder migrar posteriormente el adaptador a S3.

Cada servicio tiene un nivel mínimo: `basic` por defecto o `premium`. Los servicios básicos están incluidos en ambos planes; los servicios premium solo están incluidos en la suscripción premium. El administrador puede desactivar un servicio conservándolo en el catálogo o eliminarlo definitivamente mediante una confirmación adicional.

El administrador no aprueba las suscripciones y no puede eliminarlas ni cancelarlas desde este panel. La cancelación pertenece al usuario desde la aplicación cliente.

La eliminación de clientes está protegida: no se permite si existen suscripciones, checkouts o notificaciones vinculadas. El cliente demo local tampoco se elimina porque es necesario para el login de desarrollo.

Crear un cliente desde este backoffice crea el registro de negocio local. En desarrollo no provisiona todavía una cuenta de Cognito; esa operación se incorporará al activar el adaptador de autenticación de integración/producción.

Cuando un usuario inicia una suscripción, el backoffice puede consultar su dirección de facturación, DNI/NIF y la versión/fecha de políticas aceptada desde su ficha de cliente.

El sistema solo permite una suscripción vigente por usuario. Se considera vigente una suscripción en estado `pending`, `active`, `grace_period` o `suspended`. Las suscripciones `cancelled` o `expired` se conservan como histórico.

Cancelar desde la aplicación no borra la suscripción ni corta el acceso: marca `auto_renew = 0` y `cancel_at_period_end = 1`. El usuario conserva el servicio hasta `current_period_end` y no puede contratar otro plan hasta que ese periodo termine. Si el precio no cambia, las suscripciones con renovación activa avanzan automáticamente al siguiente periodo.

La siguiente iteración añadirá:

1. Crear, editar, activar y desactivar servicios.
2. Crear y editar planes de suscripción.
3. Consultar clientes de prueba.
4. Consultar pagos y eventos webhook.
5. Probar documentos en almacenamiento local.

## Cambio de precio

El administrador puede solicitar un cambio de precio de un plan. El backoffice exige un importe positivo y muestra una confirmación explícita:

> ¿Está seguro? Esta acción cambiará el precio para nuevas suscripciones y enviará una notificación a los usuarios para que puedan renovar la suscripción o anularla en caso de no estar de acuerdo. Las suscripciones activas conservarán su precio actual.

El precio contratado se guarda como una fotografía dentro de cada suscripción. Cambiar el plan no modifica el importe de las suscripciones existentes. En desarrollo, la notificación se registra en una cola local y también aparece en la aplicación cliente; en integración y producción se conectará a un proveedor real de correo o notificaciones push.

Un cambio de precio pausa la renovación automática de las suscripciones afectadas. El usuario puede aceptar el nuevo precio, actualizando la fotografía de precio y reactivando la renovación, o dejar que la suscripción expire al terminar el periodo vigente.

## Decisiones que ayudará a tomar

- Qué campos necesita realmente un servicio.
- Qué diferencia existe entre servicio, producto y plan.
- Qué estados de suscripción necesita el negocio.
- Qué operaciones puede realizar el cliente sin soporte técnico.
- Qué información debe aparecer en el panel de cliente.
- Qué acciones deben quedar auditadas.
- Qué partes serán configurables y cuáles pertenecerán al núcleo.

El backoffice no podrá modificar la estructura de la base de datos ni la configuración de infraestructura. En integración y producción se protegerá con Cognito y grupos de administración.
