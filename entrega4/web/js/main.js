let alexaClient;
let intervalContador = null;

Alexa.create({ version: '1.1' })
    .then(({ alexa }) => {
        alexaClient = alexa;
        alexaClient.skill.onMessage(handleMessageFromSkill);
    })
    .catch(error => {
        logToCloudwatch("Error al crear el cliente: " + error);
    });

// ----- HELPERS -----

function logToCloudwatch(text) {
    handleMessageToSkill({ action: "log_debug", message: text });
}

// Mensaje de tiempo agotado
function tiempoAgotado() {
    handleMessageToSkill({ action: "tiempo_acabado" });
}

function iniciarContador(tiempoMaximo) {
    clearInterval(intervalContador);

    let tiempoRestante = tiempoMaximo;
    const contadorDiv = document.getElementById('contador');
    contadorDiv.style.display = "block";
    contadorDiv.textContent = `Tiempo restante: ${tiempoRestante} s`;

    intervalContador = setInterval(() => {
        tiempoRestante -= 1;

        if (tiempoRestante <= 0) {
            clearInterval(intervalContador);
            contadorDiv.textContent = "¡Se acabó el tiempo!";

            logToCloudwatch("Tiempo agotado → enviando mensaje a Alexa");
            tiempoAgotado();
        } else {
            contadorDiv.textContent = `Tiempo restante: ${tiempoRestante} s`;
        }
    }, 1000);
}

// ----- Gestión de pistas -----
function mostrarPista(texto) {
    const pistaDiv = document.getElementById("pista-container");
    pistaDiv.style.display = "block";
    pistaDiv.textContent = texto;
    logToCloudwatch("Mostrando pista: " + texto);
}

function ocultarPista() {
    const pistaDiv = document.getElementById("pista-container");
    pistaDiv.style.display = "none";
    pistaDiv.textContent = "";
    logToCloudwatch("Ocultando pista");
}

// ----- Handler de mensajes desde Alexa -----
function handleMessageFromSkill(message) {
    if (!document.getElementById('iframe-container')) {
        document.addEventListener('DOMContentLoaded', () => handleMessageFromSkill(message));
        return;
    }

    if (message.action === "mostrar_puzle") {
        let url = "";
        const tiempoMaximo = message.tiempoMaximo || 0;

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
                logToCloudwatch("Tipo de puzle no reconocido: " + message.tipo);
                break;
        }

        if (url) {
            document.getElementById('iframe-container').innerHTML = `
                <iframe src="${url}" title="${message.tipo}"></iframe>
            `;
            
            if (tiempoMaximo > 0) {
                iniciarContador(tiempoMaximo);
            } else {
                document.getElementById('contador').style.display = "none";
            }

            ocultarPista();
        }
    } 
    else if (message.action === "mostrar_pista") {
        mostrarPista(message.pista);
    }
    else if (message.action === "mostrar_portada") {
        const tipo = message.tipo || 'default';
        const urlImagen = `https://d1qeen6fmshz39.cloudfront.net/entrega3/portadas_base/${tipo}.jpg`;

        document.getElementById('iframe-container').innerHTML = `
            <img src="${urlImagen}" alt="${tipo}"
             style="
               max-width: 95vw;
               max-height: 90vh;
               width: auto;
               height: auto;
               object-fit: contain;
               border-radius: 10px;
               display: block;
               margin: auto;
             "
            />
        `;
    }
    else {
        logToCloudwatch("Acción no reconocida: " + message.action);
    }
}

// ----- Handler de mensajes a Alexa -----
function handleMessageToSkill(message) {
    if (!alexaClient) return;

    const trySend = () => {
        try {
            alexaClient.skill.sendMessage(message, (result) => {
                if (!result || result.statusCode !== 200) {
                    setTimeout(trySend, 500); // reintentar medio segundo después
                }
            });
        } catch (err) {
            setTimeout(trySend, 500); // reintentar si lanza excepción
        }
    };

    trySend();
}