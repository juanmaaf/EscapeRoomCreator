let alexaClient;

Alexa.create({ version: '1.1' })
  .then(({ alexa, message }) => {
    alexaClient = alexa;
    console.log('Alexa client ready');
  })
  .catch((error) => {
    console.error('Alexa client failed to initialize:', error);
  });
  
function enviarRespuesta() {
  const boton = document.querySelector("button");
  const input = document.getElementById("respuesta");
  const valor = input.value.trim().toLowerCase().slice(0, 1);

  if (!valor) {
    alert('Por favor, introduce una letra o número.');
    return;
  }

  boton.disabled = true;

  if (alexaClient) {
    alexaClient.skill.sendMessage({
      type: 'respuestaUsuario',
      valor: valor
    }).catch(error => {
      console.error('Error enviando mensaje a la skill:', error);
    }).finally(() => {
      boton.disabled = false;
    });
  } else {
    console.error('Alexa client aún no está listo.');
    boton.disabled = false;
  }
}

