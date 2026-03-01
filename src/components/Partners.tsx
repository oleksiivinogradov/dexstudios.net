import './Partners.css';

const partners = [
    { name: 'Aleph Zero', img: '/partners/partner-1.png', url: 'https://alephzero.org' },
    { name: 'Saga', img: '/partners/partner-2.png', url: 'https://saga.xyz' },
    { name: 'Galxe', img: '/partners/partner-3.png', url: 'https://galxe.com' },
    { name: 'Concordium', img: '/partners/partner-4.png', url: 'https://concordium.com' },
    { name: 'SKALE', img: '/partners/partner-5.png', url: 'https://skale.space' },
    { name: 'Aurora', img: '/partners/partner-6.png', url: 'https://aurora.dev' },
    { name: 'Manta Network', img: '/partners/partner-7.png', url: 'https://manta.network' },
    { name: 'EOS', img: '/partners/partner-8.png', url: 'https://eosnetwork.com' },
    { name: 'Mantle', img: '/partners/partner-9.png', url: 'https://mantle.xyz' },
    { name: 'Near', img: '/partners/partner-10.png', url: 'https://near.org' },
    { name: 'Somnia', img: '/partners/partner-11.jpg', url: 'https://somnia.network' },
    { name: 'MoonBeam', img: '/partners/partner-12.png', url: 'https://moonbeam.network' },
    { name: 'BDAG', img: '/partners/partner-13.jpg', url: 'https://blockdag.network' },
];

const Partners = () => {
    return (
        <section className="partners-section">
            <div className="partners-container">
                <div className="partners-track">
                    {/* Duplicate for infinite scroll */}
                    {[...partners, ...partners].map((partner, index) => (
                        <a
                            key={index}
                            href={partner.url}
                            className="partner-item"
                            target="_blank"
                            rel="noopener noreferrer"
                            title={partner.name}
                        >
                            <img src={partner.img} alt={partner.name} />
                        </a>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default Partners;
