const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

/* ===================== CONFIGURACIÓN ===================== */

const ddb = new AWS.DynamoDB.DocumentClient({ region: 'eu-west-1' });

/* ===================== TABLAS ===================== */

const USUARIOS_TABLE = 'EscapeRoomUsuarios';
const JUEGOS_TABLE = 'EscapeRoomJuegos';

/* ===================== MÉTODOS ===================== */

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

// Listar todos los juegos
async function listarJuegos() {
    const params = {
        TableName: JUEGOS_TABLE
    };

    const result = await ddb.scan(params).promise();
    return { success: true, juegos: result.Items || [] };
}

// Guardar nuevo juego
async function guardarJuego(juego) {
    const item = {
        juegoID: uuidv4(),
        titulo: juego.titulo,
        narrativa: juego.narrativa,
        fallosmaximospuzle: juego.fallosmaximospuzle,
        tipo_portada: juego.tipo_portada,
        curso: juego.curso,
        puzles: juego.puzles,
        fecha_creacion: new Date().toISOString(),
    };

    const params = {
        TableName: JUEGOS_TABLE,
        Item: item
    };

    await ddb.put(params).promise();
    return { success: true, juego: item };
}

module.exports = { 
    registrarDocenteCoordinador, 
    loginDocenteCoordinador, 
    loginAlumno, 
    listarJuegos,
    guardarJuego
};