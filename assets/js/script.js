/* ==========================================================================
   FielTour - Interações e comportamentos dinâmicos
   ========================================================================== */

/* ---------- Configuração do Tailwind (CDN) ---------- */
if (typeof tailwind !== 'undefined') tailwind.config = {
    theme: {
        extend: {
            colors: {
                fiel: {
                    light: '#E0F2FE',
                    cyan: '#00A8E8',
                    blue: '#0284C7',
                    dark: '#0C4A6E',
                    deeper: '#082F49'
                },
                whatsapp: {
                    DEFAULT: '#25D366',
                    dark: '#128C7E'
                }
            },
            fontFamily: {
                sans: ['Inter', 'sans-serif'],
                display: ['Montserrat', 'sans-serif'],
                script: ['Pacifico', 'cursive']
            }
        }
    }
};

/* ---------- Dados dos pacotes ---------- */
const WHATSAPP_NUMBER = '5591982029843';

const packagesData = [
    {
        id: 1,
        category: 'nacional',
        badge: 'Sucesso de Vendas',
        title: 'Lençóis Maranhenses por Santo Amaro',
        dates: '20 a 23 de Novembro',
        location: 'Barreirinhas, Rio Preguiças e Santo Amaro - MA',
        image: 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&w=800&q=80',
        shortDesc: 'Explore as lagoas mais cristalinas dos Lençóis Maranhenses pelo paraíso de Santo Amaro e Barreirinhas.',
        highlights: [
            'Transporte executivo saindo de Belém',
            'Passeios em Barreirinhas e Circuito Rio Preguiças',
            'Visita às mais belas lagoas de Santo Amaro',
            'Hospedagem selecionada e acompanhamento de Guia CADASTUR'
        ]
    },
    {
        id: 2,
        category: 'nacional',
        badge: '2 Saídas Confirmadas',
        title: 'Os Encantos de Carolina - MA',
        dates: '06 a 09 de Nov • 04 a 07 de Dez',
        location: 'Complexo Pedra Caída, Poço Azul e Encanto Azul',
        image: 'https://images.unsplash.com/photo-1433086966358-54859d0ed716?auto=format&fit=crop&w=800&q=80',
        shortDesc: 'Cachoeiras de águas mornas e poços de águas absurdamente cristalinas na Chapada das Mesas.',
        highlights: [
            'Duas opções de datas em Novembro e Dezembro',
            'Visita ao famoso Complexo de Pedra Caída',
            'Banho flutuante no Poço Azul e Encanto Azul',
            'Transporte confortável, hospedagem e guia acompanhante'
        ]
    },
    {
        id: 3,
        category: 'nacional',
        badge: 'Sol & Praia',
        title: 'As Mais Belas Praias do Ceará',
        dates: '19 a 23 de Novembro',
        location: 'Jericoacoara, Fortaleza e Lagoinha - CE',
        image: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800&q=80',
        shortDesc: 'Curta as famosas redes dentro d’água em Jeri, as dunas de Lagoinha e um dia livre em Fortaleza!',
        highlights: [
            'Roteiro completo por Jericoacoara e Lagoinha',
            'Dia livre em Fortaleza para compras e praia',
            'Transporte turismo, hospedagem com café e suporte total',
            'Fotos incríveis nos principais cartões-postais do Ceará'
        ]
    },
    {
        id: 4,
        category: 'nacional',
        badge: 'Temporada 2027',
        title: 'Viagem dos Sonhos: Sul e Sudeste',
        dates: '05 a 22 de Janeiro de 2027',
        location: 'Roteiro Especial Sul & Sudeste do Brasil',
        image: 'https://images.unsplash.com/photo-1516306580123-e6e52b1b7b5f?auto=format&fit=crop&w=800&q=80',
        shortDesc: 'Uma expedição completa de férias cruzando os destinos mais charmosos e sonhados do Sul e Sudeste.',
        highlights: [
            'Parcelamento antecipado facilitado até a data da viagem',
            '18 dias de experiências inesquecíveis em família',
            'Hotéis selecionados e logística completa FielTour',
            'Vagas limitadas — garanta sua poltrona com antecedência'
        ]
    },
    {
        id: 5,
        category: 'regional',
        badge: 'Regional • Pará',
        title: 'Day Use: Ilha do Combu & Roteiros Regionais',
        dates: 'Saídas Frequentes • Consulte Agenda',
        location: 'Belém, Ilha do Combu, Mosqueiro e Marajó',
        image: 'https://images.unsplash.com/photo-1518837695005-2083093ee35b?auto=format&fit=crop&w=800&q=80',
        shortDesc: 'Experiências gastronômicas, banho de rio e contato com a natureza amazônica pertinho de Belém.',
        highlights: [
            'Travessia fluvial segura e organizada',
            'Visita aos melhores restaurantes e chocolaterias da ilha',
            'Ideal para famílias, grupos de amigos e aniversários',
            'Consulte também roteiros para Marajó e Salinópolis'
        ]
    },
    {
        id: 6,
        category: 'eventos',
        badge: 'Grupos & Caravanas',
        title: 'Congressos, Eventos & Grandes Jogos',
        dates: 'Sob Demanda • Calendário Anual',
        location: 'Saídas de Belém para todo o Brasil',
        image: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=800&q=80',
        shortDesc: 'Vai participar de um congresso ou quer levar sua torcida para um grande jogo? Nós organizamos sua caravana!',
        highlights: [
            'Fretamento e logística para congressos religiosos e acadêmicos',
            'Caravanas para grandes partidas de futebol e shows',
            'Pacotes personalizados para igrejas, empresas e faculdades',
            'Atendimento exclusivo via WhatsApp ou com hora marcada'
        ]
    }
];

/* ---------- Renderização dos cards ---------- */
function renderPackages(filter = 'todos') {
    const grid = document.getElementById('packages-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const filtered = filter === 'todos'
        ? packagesData
        : packagesData.filter(pkg => pkg.category === filter);

    filtered.forEach(pkg => {
        const whatsappMsg = encodeURIComponent(`Olá! Vim pelo site da FielTour e gostaria de ver o roteiro e valores do pacote: *${pkg.title}* (${pkg.dates}).`);
        const whatsappUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${whatsappMsg}`;

        const card = document.createElement('article');
        card.className = 'package-card card-hover group';
        card.innerHTML = `
            <div>
                <div class="package-media">
                    <img src="${pkg.image}" alt="${pkg.title}" loading="lazy">
                    <div class="package-badge">${pkg.badge}</div>
                </div>
                <div class="package-body">
                    <div class="package-dates">
                        <i class="fa-regular fa-calendar-days mt-0.5"></i>
                        <span>${pkg.dates}</span>
                    </div>
                    <h3 class="package-title">${pkg.title}</h3>
                    <p class="package-location">
                        <i class="fa-solid fa-location-dot text-fiel-cyan mt-0.5"></i>
                        <span>${pkg.location}</span>
                    </p>
                    <p class="package-desc">${pkg.shortDesc}</p>
                </div>
            </div>
            <div class="package-actions">
                <a href="${whatsappUrl}" target="_blank" rel="noopener noreferrer"
                   class="package-btn package-btn-primary">
                    <span>VER ROTEIRO</span>
                    <i class="fa-brands fa-whatsapp text-sm"></i>
                </a>
                <button type="button" data-package-id="${pkg.id}"
                        class="package-btn package-btn-secondary js-open-modal"
                        title="Ver mais detalhes">
                    Detalhes
                </button>
            </div>
        `;
        grid.appendChild(card);
    });
}

/* ---------- Filtros ---------- */
const FILTER_ACTIVE_CLASS = 'filter-btn active bg-fiel-dark text-white text-xs sm:text-sm font-bold px-4 py-2 rounded-full transition-all';
const FILTER_IDLE_CLASS = 'filter-btn bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs sm:text-sm font-semibold px-4 py-2 rounded-full transition-all';

function filterPackages(category) {
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.className = btn.getAttribute('data-filter') === category
            ? FILTER_ACTIVE_CLASS
            : FILTER_IDLE_CLASS;
    });

    renderPackages(category);

    // Scroll suave até a grade se clicado nos cards de categoria superior
    const pacotesSection = document.getElementById('pacotes');
    if (pacotesSection && window.scrollY < pacotesSection.offsetTop - 200) {
        pacotesSection.scrollIntoView({ behavior: 'smooth' });
    }
}

/* ---------- Modal de detalhes ---------- */
function openModal(id) {
    const pkg = packagesData.find(item => item.id === id);
    if (!pkg) return;

    document.getElementById('modal-img').src = pkg.image;
    document.getElementById('modal-img').alt = pkg.title;
    document.getElementById('modal-badge').textContent = pkg.badge;
    document.getElementById('modal-title').textContent = pkg.title;
    document.getElementById('modal-date').textContent = pkg.dates;
    document.getElementById('modal-location').textContent = pkg.location;
    document.getElementById('modal-desc').textContent = pkg.shortDesc;

    const highlightsList = document.getElementById('modal-highlights');
    highlightsList.innerHTML = '';
    pkg.highlights.forEach(h => {
        const li = document.createElement('li');
        li.className = 'flex items-start gap-2';
        li.innerHTML = `<i class="fa-solid fa-check text-whatsapp mt-1 text-xs"></i> <span>${h}</span>`;
        highlightsList.appendChild(li);
    });

    const whatsappMsg = encodeURIComponent(`Olá! Vi os detalhes do pacote *${pkg.title}* (${pkg.dates}) no site da FielTour e quero saber valores e formas de pagamento!`);
    document.getElementById('modal-whatsapp-link').href = `https://wa.me/${WHATSAPP_NUMBER}?text=${whatsappMsg}`;

    document.getElementById('package-modal').classList.remove('hidden');
}

function closeModal() {
    document.getElementById('package-modal').classList.add('hidden');
}

/* ---------- Inicialização ---------- */
document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('package-modal');
    const grid = document.getElementById('packages-grid');
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const mobileMenu = document.getElementById('mobile-menu');
    const menuIcon = document.getElementById('menu-icon');

    // Categorias (cards da seção "Nossas Categorias")
    document.querySelectorAll('[data-category-filter]').forEach(el => {
        el.addEventListener('click', () => filterPackages(el.dataset.categoryFilter));
    });

    // Botões de filtro
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => filterPackages(btn.dataset.filter));
    });

    // Botão "Detalhes" (delegação, pois os cards são renderizados dinamicamente)
    grid.addEventListener('click', event => {
        const btn = event.target.closest('.js-open-modal');
        if (btn) openModal(Number(btn.dataset.packageId));
    });

    // Fechar modal: botões, clique fora e tecla Esc
    document.querySelectorAll('.js-close-modal').forEach(btn => {
        btn.addEventListener('click', closeModal);
    });
    modal.addEventListener('click', event => {
        if (event.target === modal) closeModal();
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') closeModal();
    });

    // Menu mobile
    mobileMenuBtn.addEventListener('click', () => {
        mobileMenu.classList.toggle('hidden');
        menuIcon.className = mobileMenu.classList.contains('hidden')
            ? 'fa-solid fa-bars text-2xl'
            : 'fa-solid fa-xmark text-2xl';
    });

    document.querySelectorAll('.mobile-link').forEach(link => {
        link.addEventListener('click', () => {
            mobileMenu.classList.add('hidden');
            menuIcon.className = 'fa-solid fa-bars text-2xl';
        });
    });

    // Galeria: se alguma foto não carregar, o card é ocultado (sem imagem quebrada)
    const galleryGrid = document.getElementById('gallery-grid');
    if (galleryGrid) {
        galleryGrid.addEventListener('error', event => {
            if (event.target.tagName === 'IMG') {
                const card = event.target.closest('.gallery-card');
                if (card) card.hidden = true;
            }
        }, true);
    }

    renderPackages('todos');
});
