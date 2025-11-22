import './Games.css';

const Games = () => {
    return (
        <section id="games" className="games section">
            <div className="container">
                <div className="section-title">
                    <h2>Our Games</h2>
                    <p>Experience the future of Web3 gaming</p>
                </div>

                <div className="games-list">
                    {/* DexGO */}
                    <div className="game-item">
                        <div className="game-content">
                            <div className="game-number">01</div>
                            <div className="game-badge">
                                <img src="/images/LabelUp_v1.png" alt="DexGO" />
                            </div>
                            <h3>DexGO</h3>
                            <p className="game-description">
                                The game created for healthy lifestyle growth, traveling and earning.
                                It's easy: put on NFT sneakers and go on a journey through the routes of your own city, get money for this.
                            </p>
                            <div className="game-stats">
                                <div className="stat">
                                    <span className="stat-value">15M+</span>
                                    <span className="stat-label">Views in social media</span>
                                </div>
                            </div>
                            <a href="https://www.dexgo.club/en" className="btn btn-primary" target="_blank" rel="noopener noreferrer">
                                Visit Website
                            </a>
                        </div>
                        <div className="game-image">
                            <img src="/images/287f6f_c58d92c2814849ea9b577930456ab98a~mv2.png" alt="DexGO Game Screenshot" className="game-screenshot" />
                        </div>
                    </div>

                    {/* MotoDEX */}
                    <div className="game-item game-item-reverse">
                        <div className="game-image">
                            <img src="/images/287f6f_a57c4853c30948d0825587999b102e0ff000.jpg" alt="MotoDEX Game Screenshot" className="game-screenshot" />
                        </div>
                        <div className="game-content">
                            <div className="game-number">02</div>
                            <div className="game-badge">
                                <img src="/images/LabelDown_v1.png" alt="MotoDEX" />
                            </div>
                            <h3>MotoDEX</h3>
                            <p className="game-description">
                                The blockchain game, in which users participate in motorcycle races,
                                develop their riders and improve high-speed tracks.
                            </p>
                            <div className="game-stats">
                                <div className="stat">
                                    <span className="stat-value">TOP 3</span>
                                    <span className="stat-label">Game worldwide</span>
                                </div>
                                <div className="stat">
                                    <span className="stat-value">2.76M</span>
                                    <span className="stat-label">UAW</span>
                                </div>
                            </div>
                            <a href="https://motodex.dexstudios.games" className="btn btn-primary" target="_blank" rel="noopener noreferrer">
                                Visit Website
                            </a>
                        </div>
                    </div>

                    {/* SeaBattle VR */}
                    <div className="game-item">
                        <div className="game-content">
                            <div className="game-number">03</div>
                            <h3>SeaBattle VR</h3>
                            <p className="game-description">
                                Dive into the heart-pounding action of SeaBattle VR game by DEXStudios,
                                an immersive virtual reality game that puts you at the helm of a powerful submarine.
                            </p>
                            <a href="https://www.meta.com/experiences/6986229381496565/?require_login=true&utm_source=developer.oculus.com&utm_medium=oculusredirect"
                                className="btn btn-primary" target="_blank" rel="noopener noreferrer">
                                Download App
                            </a>
                        </div>
                        <div className="game-image">
                            <img src="/images/287f6f_acedbfef222b4987b8cb54360b981da3f000.jpg" alt="SeaBattle VR Game Screenshot" className="game-screenshot" />
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default Games;
