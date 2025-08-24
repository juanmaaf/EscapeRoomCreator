let alexaClient;
let intervalContador = null;

/* ===================== CREACIÓN CLIENTE ALEXA ===================== */

Alexa.create({ version: '1.1' })
    .then(({ alexa }) => {
        alexaClient = alexa;
        alexaClient.skill.onMessage(handleMessageFromSkill);
    })
    .catch(error => {
        logToCloudwatch("Error al crear el cliente: " + error);
    });

/* ===================== HELPERS ===================== */

function logToCloudwatch(text) {
    handleMessageToSkill({ action: "log_debug", message: text });
}

// Mensaje de tiempo agotado
function tiempoAgotado() {
    handleMessageToSkill({ action: "tiempo_acabado" });
}

// Temporizador puzles
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

// Mostrar pista en pantalla
function mostrarPista(texto) {
    const pistaDiv = document.getElementById("pista-container");
    pistaDiv.style.display = "block";
    pistaDiv.textContent = texto;
    logToCloudwatch("Mostrando pista: " + texto);
}

// Eliminar pista de la pantalla
function ocultarPista() {
    const pistaDiv = document.getElementById("pista-container");
    pistaDiv.style.display = "none";
    pistaDiv.textContent = "";
    logToCloudwatch("Ocultando pista");
}

/* ===================== REGISTRO/LOGIN USUARIOS ===================== */

// Formulario alumno -> Únicamente login sencillo
function mostrarFormularioAlumno() {
    document.getElementById("menu-inicial").innerHTML = `
      <form id="form-alumno">
        <label>Nombre:</label>
        <input type="text" id="nombreAlumno" required>
        <label>Curso:</label>
        <input type="text" id="cursoAlumno" required>
        <label>Grupo:</label>
        <input type="text" id="grupoAlumno" required>
        <button type="submit">Entrar</button>
      </form>
    `;

    document.getElementById("form-alumno").onsubmit = (e) => {
        e.preventDefault();
        const alumno = {
            nombre: document.getElementById("nombreAlumno").value,
            curso: document.getElementById("cursoAlumno").value,
            grupo: document.getElementById("grupoAlumno").value
        };
        logToCloudwatch("Intentando login de alumno: " + JSON.stringify(alumno));
        handleMessageToSkill({ action: "login_alumno", datos: alumno });

        document.getElementById("menu-inicial").innerHTML = `
            <button onclick="mostrarFormularioAlumno()">Soy Alumno</button>
            <button onclick="mostrarFormularioProfesor()">Soy Profesor</button>
        `;
    };
}

// Formulario profesor -> Login con usuario y contraseña
function mostrarFormularioProfesor() {
    document.getElementById("menu-inicial").innerHTML = `
      <form id="form-profesor">
        <label>Usuario:</label>
        <input type="text" id="usuarioProfesor" required>
        <label>Contraseña:</label>
        <input type="password" id="passwordProfesor" required>
        <button type="submit">Entrar</button>
        <button type="button" onclick="mostrarRegistroProfesor()">Registrarse</button>
      </form>
    `;

    document.getElementById("form-profesor").onsubmit = (e) => {
        e.preventDefault();
        const profesor = {
            usuario: document.getElementById("usuarioProfesor").value,
            password: document.getElementById("passwordProfesor").value
        };
        logToCloudwatch("Intentando login de profesor: " + JSON.stringify({ usuario: profesor.usuario }));
        handleMessageToSkill({ action: "login_profesor", datos: profesor });

        document.getElementById("menu-inicial").innerHTML = `
            <button onclick="mostrarFormularioAlumno()">Soy Alumno</button>
            <button onclick="mostrarFormularioProfesor()">Soy Profesor</button>
        `;
    };
}

// Formulario profesor -> Registro con nombre, usuario y contraseña
function mostrarRegistroProfesor() {
    document.getElementById("menu-inicial").innerHTML = `
      <form id="registro-profesor">
        <label>Nombre:</label>
        <input type="text" id="nombreProfesor" required>
        <label>Usuario:</label>
        <input type="text" id="usuarioNuevo" required>
        <label>Contraseña:</label>
        <input type="password" id="passwordNuevo" required>
        <button type="submit">Registrarse</button>
      </form>
    `;

    document.getElementById("registro-profesor").onsubmit = (e) => {
        e.preventDefault();
        const profesor = {
            nombre: document.getElementById("nombreProfesor").value,
            usuario: document.getElementById("usuarioNuevo").value,
            password: document.getElementById("passwordNuevo").value
        };
        logToCloudwatch("Intentando registro de profesor: " + JSON.stringify({ nombre: profesor.nombre, usuario: profesor.usuario }));
        handleMessageToSkill({ action: "registrar_profesor", datos: profesor });

        document.getElementById("menu-inicial").innerHTML = `
            <button onclick="mostrarFormularioAlumno()">Soy Alumno</button>
            <button onclick="mostrarFormularioProfesor()">Soy Profesor</button>
        `;
    };
}

/* ===================== HANDLERS ===================== */


// Mensajes recibidos de la skill 
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
                    url = `https://d1qeen6fmshz39.cloudfront.net/entrega4/paginas_puzles/cifrado_cesar.html?mensajeCifrado=${mensaje}`;
                }
                break;

            case "acertijo":
                if (message.instruccion) {
                    const instr = encodeURIComponent(message.instruccion);
                    url = `https://d1qeen6fmshz39.cloudfront.net/entrega4/paginas_puzles/acertijo.html?instruccion=${instr}`;
                }
                break;

            case "logica":
                if (message.instruccion) {
                    const instr = encodeURIComponent(message.instruccion);
                    url = `https://d1qeen6fmshz39.cloudfront.net/entrega4/paginas_puzles/logica.html?instruccion=${instr}`;
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
        const urlImagen = `https://d1qeen6fmshz39.cloudfront.net/entrega4/portadas_base/${tipo}.jpg`;

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

// Mensajes enviados a la skill
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

/* =====================  ===================== */