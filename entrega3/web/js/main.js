let alexaClient;

Alexa.create({ version: '1.1' })
    .then(({ alexa }) => {
        alexaClient = alexa;

        alexaClient.skill.onMessage(handleMessageFromSkill);
    })
    .catch(error => {
        console.error('Error al crear el cliente de Alexa:', error);
    });

function handleMessageFromSkill(message) {
    if (!document.getElementById('iframe-container')) {
        document.addEventListener('DOMContentLoaded', () => handleMessageFromSkill(message));
        return;
    }
    
    if (message.action === "mostrar_puzle") {
        switch (message.tipo) {
            case "cifrado-cesar":
                if (message.datos && message.datos.mensajeCifrado) {
                    const mensaje = encodeURIComponent(message.datos.mensajeCifrado);
                    const url = `https://d1qeen6fmshz39.cloudfront.net/entrega3/paginas_puzles/cifrado_cesar.html?mensajeCifrado=${mensaje}`;

                    document.getElementById('iframe-container').innerHTML = `
                        <iframe src="${url}" title="Cifrado César"></iframe>
                    `;
                }
                break;

            default:
                console.warn(`Tipo de puzle no reconocido: ${message.tipo}`);
                break;
        }
    } else {
        console.log("Acción no reconocida:", message.action);
    }
}