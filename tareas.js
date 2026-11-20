window.TAREAS = {
  prototipo: "Librero · préstamo de libros entre amigos",
  fichas: {
    "Dueño": "Tienes unos 200 libros y se los prestas a 5–15 amigos. Hoy anotas los préstamos de memoria y ya perdiste libros. Quieres saber siempre quién tiene qué. En el prototipo, «hoy» es el 19 de noviembre de 2026.",
    "Amigo (Ana)": "Eres Ana. Un amigo te invitó a ver sus libros y ya tienes uno prestado. Quieres pedir otro sin escribirle por WhatsApp. En el prototipo, «hoy» es el 19 de noviembre de 2026.",
    "Sin cuenta": "Un amigo te mandó una invitación para ver sus libros. Todavía no tienes cuenta en la app."
  },
  prueba: "librero-ronda-3",
  enviar: "https://script.google.com/macros/s/AKfycbza7mgESzmew__AFZtopQQbpr-EZc1ZV2R1VRVxEh1s2gAMtoPxWIjQSWq5yUxwUqDn/exec",
  enviarA: "una hoja de cálculo del equipo que hace la app",
  tareas: [
    { id: 1, rol: "Dueño", hu: "HU-014", texto: "¿Qué requiere tu atención hoy? Dilo sin entrar a ninguna pantalla aparte del inicio." },
    { id: 2, rol: "Dueño", hu: "HU-010", texto: "Luis te pidió «Rayuela»: préstaselo hasta el 3 de diciembre." },
    { id: 3, rol: "Dueño", hu: "HU-012", texto: "Ana te devolvió hoy «La sombra del viento»: regístralo." },
    { id: 4, rol: "Dueño", hu: "HU-004", texto: "Registra «El amor en los tiempos del cólera» usando su ISBN (9788420471839)." },
    { id: 5, rol: "Dueño", hu: "HU-005", texto: "Tienes que dejar de prestar «Rayuela»: intenta quitarla del catálogo." },
    { id: 6, rol: "Dueño", hu: "HU-016", texto: "¿Quién tuvo «Cien años de soledad» antes que Marta y cuándo lo devolvió?" },
    { id: 7, rol: "Dueño", hu: "HU-001, HU-017", texto: "Invita a un amigo nuevo y revoca la invitación que vence primero." },
    { id: 8, rol: "Amigo (Ana)", hu: "HU-008", texto: "Busca un libro de Borges e intenta pedirlo. ¿Puedes? ¿Por qué?" },
    { id: 9, rol: "Amigo (Ana)", hu: "HU-009", texto: "Ya no quieres «Como agua para chocolate»: cancela el pedido." },
    { id: 10, rol: "Amigo (Ana)", hu: "HU-015", texto: "¿Qué libro debes devolver y cuántos días de atraso llevas?" },
    { id: 11, rol: "Amigo (Ana)", hu: "HU-015", texto: "¿Por qué no te prestaron «Ficciones» la vez pasada?" },
    { id: 12, rol: "Sin cuenta", hu: "HU-002", texto: "Entra a la app con tu correo." },
    { id: 13, rol: "Sin cuenta", hu: "HU-001", texto: "Abre una invitación vencida y luego una válida, y únete." }
  ]
};
