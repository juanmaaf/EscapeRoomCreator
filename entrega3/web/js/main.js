let alexaClient;

Alexa.create({ version: '1.1' })
    .then(({ alexa }) => {
        alexaClient = alexa;
        console.log('Alexa ready');

        alexaClient.onMessage((message) => {
            console.log("Mensaje recibido desde la skill:", message);
        
            const { action, tipo, datos } = message;
        
            if (action === "mostrar_puzle") {
                const container = document.getElementById('iframe-container');
        
                switch (tipo) {
                    case "cifrado-cesar":
                        if (datos && datos.mensajeCifrado) {
                            const mensaje = encodeURIComponent(datos.mensajeCifrado);
                            const url = `https://d1qeen6fmshz39.cloudfront.net/entrega3/paginas_puzles/cifrado_cesar.html?mensajeCifrado=${mensaje}`;
        
                            container.innerHTML = `
                                <iframe src="${url}" title="Cifrado César"></iframe>
                            `;
                        } else {
                            container.innerHTML = `<p>Error: faltan datos para el puzle de cifrado César</p>`;
                            console.warn("Faltan datos para el puzle de cifrado César");
                        }
                        break;
        
                    default:
                        container.innerHTML = `<p style="text-align:center;">Tipo de puzle no reconocido: ${tipo}</p>`;
                        console.warn(`Tipo de puzle no reconocido: ${tipo}`);
                        break;
                }
            }
        });
    })
    .catch(error => {
        console.error('Alexa not ready', error);
    });