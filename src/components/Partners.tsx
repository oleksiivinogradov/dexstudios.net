import './Partners.css';

const partners = [
    { name: 'Saga', img: 'https://logo.clearbit.com/saga.xyz', url: 'https://saga.xyz' },
    { name: 'Polygon', img: 'https://logo.clearbit.com/polygon.technology', url: 'https://polygon.technology' },
    { name: 'Chainlink', img: 'https://logo.clearbit.com/chain.link', url: 'https://chain.link' },
    { name: 'Near', img: 'https://logo.clearbit.com/near.org', url: 'https://near.org' },
    { name: 'Aurora', img: 'https://logo.clearbit.com/aurora.dev', url: 'https://aurora.dev' },
    { name: 'CoinGecko', img: 'https://logo.clearbit.com/coingecko.com', url: 'https://coingecko.com' },
    { name: 'CoinMarketCap', img: 'https://logo.clearbit.com/coinmarketcap.com', url: 'https://coinmarketcap.com' },
    { name: 'BNB Chain', img: 'https://logo.clearbit.com/bnbchain.org', url: 'https://bnbchain.org' },
    { name: 'Ethereum', img: 'https://logo.clearbit.com/ethereum.org', url: 'https://ethereum.org' },
    { name: 'Solana', img: 'https://logo.clearbit.com/solana.com', url: 'https://solana.com' },
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
