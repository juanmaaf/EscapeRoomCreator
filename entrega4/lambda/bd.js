const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

/* ===================== CONFIGURACIÓN ===================== */

const ddb = new AWS.DynamoDB.DocumentClient({ region: 'eu-west-1' });

/* ===================== TABLAS ===================== */

const USUARIOS_TABLE = 'EscapeRoomUsuarios';
const JUEGOS_TABLE = 'EscapeRoomJuegos';
const SESIONES_TABLE = 'EscapeRoomSesiones';
const RESULTADOS_TABLE = 'EscapeRoomResultados';

/* ===================== MÉTODOS ===================== */

/* ---------------------- USUARIOS ------------------------ */
// Registro docente/coordinador
async function registrarDocenteCoordinador({ nombre, usuario, password, tipo }) {
    if (!['docente', 'coordinador'].includes(tipo)) {
        return { success: false, message: 'Tipo de usuario no válido' };
    }

    const existing = await ddb.query({
        TableName: USUARIOS_TABLE,
        IndexName: 'DocentesCoordinadoresIndex',
        KeyConditionExpression: 'tipo = :tipo AND usuario = :usuario',
        ExpressionAttributeValues: {
            ':tipo': tipo,
            ':usuario': usuario
        }
    }).promise();

    if (existing.Items.length > 0) {
        return { success: false, message: `El ${tipo} ya existe` };
    }

    const userId = uuidv4();
    const hashedPassword = await bcrypt.hash(password, 10);

    const item = {
        userID: userId,
        tipo,
        nombre,
        usuario,
        password: hashedPassword
    };

    await ddb.put({ TableName: USUARIOS_TABLE, Item: item }).promise();
    return { success: true, userId };
}

// Login docente/coordinador
async function loginDocenteCoordinador(usuario, password, tipo) {
    if (!['docente', 'coordinador'].includes(tipo)) {
        return { success: false, message: 'Tipo de usuario no válido' };
    }

    const params = {
        TableName: USUARIOS_TABLE,
        IndexName: 'DocentesCoordinadoresIndex',
        KeyConditionExpression: 'tipo = :tipo AND usuario = :usuario',
        ExpressionAttributeValues: {
            ':tipo': tipo,
            ':usuario': usuario
        }
    };

    const result = await ddb.query(params).promise();
    if (result.Items.length === 0) return { success: false, message: 'Usuario no encontrado' };

    const user = result.Items[0];
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) return { success: false, message: 'Contraseña incorrecta' };

    return { success: true, userId: user.userID, nombre: user.nombre };
}

// Login alumno (con registro si no existe)
async function loginAlumno(nombre, curso, grupo) {
    const nombreCursoGrupo = `${nombre}#${curso}#${grupo}`;

    const paramsQuery = {
        TableName: USUARIOS_TABLE,
        IndexName: 'AlumnosIndex',
        KeyConditionExpression: 'tipo = :tipo AND nombreCursoGrupo = :ncg',
        ExpressionAttributeValues: {
            ':tipo': 'alumno',
            ':ncg': nombreCursoGrupo
        }
    };

    const result = await ddb.query(paramsQuery).promise();
    if (result.Items.length > 0) {
        const alumno = result.Items[0];
        return { success: true, userId: alumno.userID, nombre: alumno.nombre };
    }

    // Registrar alumno si no existe
    const userId = uuidv4();
    const item = {
        userID: userId,
        tipo: 'alumno',
        nombre,
        curso,
        grupo,
        nombreCursoGrupo
    };

    await ddb.put({ TableName: USUARIOS_TABLE, Item: item }).promise();
    return { success: true, userId, nombre };
}

/* ---------------------- JUEGOS ------------------------ */

// Listar todos los juegos
async function listarJuegos() {
    const result = await ddb.scan({ TableName: JUEGOS_TABLE }).promise();
    return { success: true, juegos: result.Items || [] };
}

// Guardar nuevo juego (sin duplicados por título)
async function guardarJuego(juego) {
    // 1. Comprobar si ya existe el título
    const existing = await ddb.query({
        TableName: JUEGOS_TABLE,
        IndexName: 'TituloIndex',
        KeyConditionExpression: 'titulo = :t',
        ExpressionAttributeValues: { ':t': juego.titulo }
    }).promise();

    if (existing.Items.length > 0) {
        return { success: false, message: `Ya existe un juego con el título "${juego.titulo}"` };
    }

    // 2. Guardar juego si no existe
    const item = {
        juegoID: uuidv4(),
        titulo: juego.titulo,
        narrativa: juego.narrativa,
        fallosMaximosPuzle: juego.fallosMaximosPuzle,
        tipo_portada: juego.tipo_portada,
        curso: juego.curso,
        puzles: juego.puzles,
        fecha_creacion: new Date().toISOString(),
    };

    await ddb.put({ TableName: JUEGOS_TABLE, Item: item }).promise();
    return { success: true, juego: item };
}

// Buscar juego por título
async function buscarJuegoPorTitulo(titulo) {
    const result = await ddb.scan({ TableName: JUEGOS_TABLE }).promise();
    const juegosFiltrados = result.Items.filter(j => j.titulo.toLowerCase() === titulo);

    return { success: true, juegos: juegosFiltrados };
}

// Buscar juego por ID
async function buscarJuegoPorID(juegoID) {
    if (!juegoID) return { success: false, juego: null };

    const params = {
        TableName: JUEGOS_TABLE,
        Key: { juegoID }
    };

    const result = await ddb.get(params).promise();
    return { success: true, juego: result.Item };
}

/* ---------------------- SESIONES ------------------------ */

// Crear Sesión
async function crearSesion(userID, tipoUsuario, juegoID = null) {
    const sesionID = uuidv4();
    const item = {
        userID,
        sesionID,
        tipoUsuario,
        juegoID,
        puzleActual: 0,
        puzleIniciado: false,
        puzleTiempoActivo: false,
        fallosPuzle: 0,
        fallosTotales: 0,
        puzlesSuperados: 0,
        fechaInicioJuego: null,
        fechaFinJuego: null,
        fechaCreacion: new Date().toISOString()
    };

    await ddb.put({ TableName: SESIONES_TABLE, Item: item }).promise();
    return { success: true, sesionID, item };
}

// Obtener Sesión
async function obtenerSesion(userID, sesionID) {
    const params = {
        TableName: SESIONES_TABLE,
        Key: { userID, sesionID }
    };
    const result = await ddb.get(params).promise();
    return result.Item || null;
}

// Actualizar Sesión
async function actualizarSesion(userID, sesionID, cambios) {
    const updateExpr = [];
    const exprAttrValues = {};

    for (const key in cambios) {
        updateExpr.push(`${key} = :${key}`);
        exprAttrValues[`:${key}`] = cambios[key];
    }

    const params = {
        TableName: SESIONES_TABLE,
        Key: { userID, sesionID },
        UpdateExpression: `SET ${updateExpr.join(', ')}`,
        ExpressionAttributeValues: exprAttrValues,
        ReturnValues: "ALL_NEW"
    };

    const result = await ddb.update(params).promise();
    return result.Attributes;
}

// Borrar Sesión
async function eliminarSesion(userID, sesionID) {
    const params = {
        TableName: SESIONES_TABLE,
        Key: { userID, sesionID }
    };
    await ddb.delete(params).promise();
    return { success: true };
}

/* ---------------------- RESULTADOS ------------------------ */



/* ---------------------- EXPORTS ------------------------ */

module.exports = { 
    registrarDocenteCoordinador, 
    loginDocenteCoordinador, 
    loginAlumno, 
    listarJuegos,
    guardarJuego,
    buscarJuegoPorTitulo,
    buscarJuegoPorID,
    crearSesion,
    obtenerSesion,
    actualizarSesion,
    eliminarSesion
};