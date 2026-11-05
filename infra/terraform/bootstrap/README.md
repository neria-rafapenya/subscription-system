# Bootstrap AWS

Este directorio se utilizará una sola vez por cuenta AWS para preparar el estado remoto de Terraform.

El bucket de estado debe tener:

- versionado;
- cifrado del lado de servidor;
- bloqueo de acceso público;
- política IAM limitada;
- bloqueo mediante `use_lockfile` del backend S3.

El nombre del bucket y la región se proporcionarán mediante un fichero local de backend que no se subirá al repositorio.
