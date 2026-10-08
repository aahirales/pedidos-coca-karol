PEDIDOS COCA-COLA KAROL — V6.4

ANTES de subir la aplicación:
1) Abrir Supabase > SQL Editor.
2) Pegar y ejecutar TODO el archivo 02_pedido_unico_v64.sql proporcionado por separado.
3) Comprobar que la consulta SELECT * FROM public.pedido_compartido; devuelve 1 fila.
4) Subir los archivos web incluidos en este ZIP al repositorio de GitHub.
5) Abrir la web en ventana privada y comprobar el indicador v6.4.
6) Iniciar sesión. Debe aparecer «Pedido único compartido».

IMPORTANTE
- Solo hay un pedido de Coca-Cola para todos los empleados, no uno por usuario.
- Los botones +/- son operaciones atómicas en la nube.
- La app consulta nuevas cantidades cada ~3,5 segundos mientras esté visible.
- Sin sesión/conexión no deben modificarse las cantidades del pedido compartido.
- Al confirmar envío de WhatsApp, solo se cierra si nadie cambió las cantidades durante el envío.
- No publicar nuevamente el catálogo inicial; los 321 productos ya están en Supabase.
- No borrar datos locales de la versión anterior.
- Esta entrega pasó verificaciones estáticas; necesita prueba funcional en Supabase real.
