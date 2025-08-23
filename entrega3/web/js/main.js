let alexaClient;
let intervalContador = null;

// Flag de debug: False para producción
const DEBUG_MODE = true;

function logToScreen(text) {
    if (!DEBUG_MODE) return;

    let logDiv = document.getElementById("debug-log");
    if (logDiv.style.display === "none") {
        logDiv.style.display = "block";
    }
    const p = document.createElement("div");
    p.textContent = text;
    logDiv.appendChild(p);
    logDiv.scrollTop = logDiv.scrollHeight;
}

Alexa.create({ version: '1.1' })
    .then(({ alexa }) => {
        alexaClient = alexa;
        alexaClient.skill.onMessage(handleMessageFromSkill);
        logToScreen("Alexa client inicializado");
    })
    .catch(error => {
        logToScreen("Error al crear el cliente: " + error);
    });

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

            logToScreen("Tiempo agotado → enviando mensaje a Alexa");

            handleMessageToSkill({ action: "tiempo_acabado" });
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
    logToScreen("Mostrando pista: " + texto);
}

function ocultarPista() {
    const pistaDiv = document.getElementById("pista-container");
    pistaDiv.style.display = "none";
    pistaDiv.textContent = "";
    logToScreen("Ocultando pista");
}

// ----- Handler de mensajes desde Alexa -----
function handleMessageFromSkill(message) {
    if (!document.getElementById('iframe-container')) {
        document.addEventListener('DOMContentLoaded', () => handleMessageFromSkill(message));
        return;
    }

    logToScreen("Mensaje recibido de Alexa: " + JSON.stringify(message));

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
                logToScreen("Tipo de puzle no reconocido: " + message.tipo);
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
    else {
        logToScreen("Acción no reconocida: " + message.action);
    }
}

// ----- Handler de mensajes a Alexa -----
function handleMessageToSkill(message) {
    if (alexaClient != null) {
        logToScreen("Enviando mensaje a Alexa: " + JSON.stringify(message));
        alexaClient.skill.sendMessage(message);
    } 
    else {
        logToScreen("No se pudo enviar: cliente no inicializado");
    }
}