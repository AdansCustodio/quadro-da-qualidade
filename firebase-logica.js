// --- 1. LER DADOS E EXIBIR ---
// Monitora as mudanças nos dados (escuta em tempo real)
historicoRef.on('value', (snapshot) => {
    listaHistorico.innerHTML = ''; // Limpa a lista antes de reconstruir

    const dadosDoBanco = snapshot.val(); 

    if (dadosDoBanco) {
        // Pega as chaves dos objetos (o ID único gerado pelo Firebase)
        const chaves = Object.keys(dadosDoBanco).reverse(); // Exibir mais recentes primeiro

        chaves.forEach(key => {
            const item = dadosDoBanco[key];
            const li = document.createElement('li');
            li.textContent = `[${item.data}] - ${item.informacao}`;
            listaHistorico.appendChild(li);
        });
    } else {
        listaHistorico.innerHTML = '<li>Nenhum histórico encontrado.</li>';
    }
});


// --- 2. ESCREVER DADOS ---
formulario.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const novaInfo = campoInfo.value.trim();

    if (novaInfo === "") {
        alert("A informação não pode estar vazia.");
        return;
    }

    const novoItem = {
        informacao: novaInfo,
        data: new Date().toLocaleString('pt-BR'), // Data e hora atual
    };

    // Usa push() para adicionar um novo item com um ID único
    historicoRef.push(novoItem)
        .then(() => {
            console.log('Informação salva no Firebase!');
            campoInfo.value = ''; // Limpa o campo de input
        })
        .catch((error) => {
            console.error('Erro ao salvar:', error);
            alert('Erro ao salvar no banco de dados. Verifique o console.');
        });
});
