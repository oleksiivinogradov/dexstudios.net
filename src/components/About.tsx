import './About.css';
import { GamesIcon, DTokenIcon, DChainIcon, AcceleratorIcon } from './Icons';

const About = () => {
    return (
        <section id="about" className="about section">
            <div className="container">
                <div className="section-title">
                    <h2>Full cycle Web3 Game Studios</h2>
                    <p>Web3 Gaming with DEXStudios</p>
                </div>

                <div className="about-content">
                    <p className="about-description">
                        Immerse yourself in the dynamic Ecosystem of DEXStudios, a convergence of innovation and entertainment.
                        Our ecosystem comprises the thrilling games of DexGO and MotoDEX, alongside upcoming projects in our
                        Accelerator, our own DTOKEN, and the eagerly anticipated D Chain.
                    </p>
                    <p className="about-description">
                        Our Decision to introduce an entire Ecosystem was fueled by the desire to offer more than just games.
                    </p>
                </div>

                <div className="products-grid grid grid-4">
                    <div className="product-card card animate-fade-in">
                        <div className="product-icon">
                            <GamesIcon />
                        </div>
                        <h3>Games</h3>
                        <p>
                            We specialize in creating Web3 games, from hyper casual game MotoDEX to game with AR - DexGO.
                            We are dedicated to bringing social value and promoting a healthy lifestyle through our games.
                        </p>
                        <a href="#games" className="product-link">Read more →</a>
                    </div>

                    <div className="product-card card animate-fade-in" style={{ animationDelay: '0.1s' }}>
                        <div className="product-icon">
                            <DTokenIcon />
                        </div>
                        <h3>DTOKEN</h3>
                        <p>
                            At the core of our ecosystem, comes in two variants – Community and Investor Tokens.
                            Community Tokens are earned through studio distributions and Accelerator.
                        </p>
                        <a href="https://docs.openbisea.com/dexstudio/dexstudio-vision/tokenomics"
                            className="product-link"
                            target="_blank"
                            rel="noopener noreferrer">
                            Read more →
                        </a>
                    </div>

                    <div className="product-card card animate-fade-in" style={{ animationDelay: '0.2s' }}>
                        <div className="product-icon">
                            <DChainIcon />
                        </div>
                        <h3>D Chain</h3>
                        <p>
                            The upcoming blockchain is powered by SAGA protocol. We've already set up two blockchain testnets
                            for our games MotoDEX and DexGO on Saga, and the activity there is booming.
                        </p>
                        <a href="https://docs.openbisea.com/dexstudio/d-chain/about-us"
                            className="product-link"
                            target="_blank"
                            rel="noopener noreferrer">
                            Read more →
                        </a>
                    </div>

                    <div className="product-card card animate-fade-in" style={{ animationDelay: '0.3s' }}>
                        <div className="product-icon">
                            <AcceleratorIcon />
                        </div>
                        <h3>Accelerator</h3>
                        <p>
                            We are committed to sharing our experience and fostering the growth of promising games and studios
                            within the industry. This initiative reflects our commitment to creating a vibrant ecosystem.
                        </p>
                        <a href="https://docs.openbisea.com/dexstudio/accelerator/accelerator"
                            className="product-link"
                            target="_blank"
                            rel="noopener noreferrer">
                            Read more →
                        </a>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default About;
