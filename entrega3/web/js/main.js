let alexaClient;
let intervalContador = null;

Alexa.create({ version: '1.1' })
    .then(({ alexa }) => {
        alexaClient = alexa;
        alexaClient.skill.onMessage(handleMessageFromSkill);
    })
    .catch(error => {
        console.error('Error al crear el cliente de Alexa:', error);
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

            if (alexaClient) {
                alexaClient.skill.sendMessage({
                    action: "tiempo_acabado"
                });
            }
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
}

function ocultarPista() {
    const pistaDiv = document.getElementById("pista-container");
    pistaDiv.style.display = "none";
    pistaDiv.textContent = "";
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
                console.warn(`Tipo de puzle no reconocido: ${message.tipo}`);
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
        console.log("Acción no reconocida:", message.action);
    }
}