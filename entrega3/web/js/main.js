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
        let url = "";

        switch (message.tipo) {
            case "cifrado-cesar":
                if (message.datos && message.datos.mensajeCifrado) {
                    const mensaje = encodeURIComponent(message.datos.mensajeCifrado);
                    url = `https://d1qeen6fmshz39.cloudfront.net/entrega3/paginas_puzles/cifrado_cesar.html?mensajeCifrado=${mensaje}`;
                }
                break;

            case "acertijo":
                if (message.instruccion) {
                    const instr = encodeURIComponent(message.instruccion);
                    url = `https://d1qeen6fmshz39.cloudfront.net/entrega3/paginas_puzles/acertijo.html?instruccion=${instr}`;
                }
                break;

            case "logica":
                if (message.instruccion) {
                    const instr = encodeURIComponent(message.instruccion);
                    url = `https://d1qeen6fmshz39.cloudfront.net/entrega3/paginas_puzles/logica.html?instruccion=${instr}`;
                }
                break;

            default:
                console.warn(`Tipo de puzle no reconocido: ${message.tipo}`);
                break;
        }

        if (url) {
            document.getElementById('iframe-container').innerHTML = `
                <iframe src="${url}" title="${message.tipo}"></iframe>
            `;
        }
    } else {
        console.log("Acción no reconocida:", message.action);
    }
}