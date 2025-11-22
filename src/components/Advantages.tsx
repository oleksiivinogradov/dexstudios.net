import './Advantages.css';

const Advantages = () => {
    return (
        <section className="advantages section">
            <div className="container">
                <div className="section-title">
                    <h2>Competitive Advantages</h2>
                    <p>What sets us apart in the Web3 gaming industry</p>
                </div>

                <div className="advantages-grid grid grid-2">
                    <div className="advantage-card card">
                        <div className="advantage-icon">📋</div>
                        <h3>Prioritized Task Management</h3>
                        <p>
                            We adopt a meticulous approach to team management, emphasizing prioritization
                            to align with operational costs.
                        </p>
                    </div>

                    <div className="advantage-card card">
                        <div className="advantage-icon">⚡</div>
                        <h3>High-Speed Development</h3>
                        <p>
                            We adopt a phased strategy, breaking down the development cycle into phases,
                            including demo releases first and next versions.
                        </p>
                    </div>

                    <div className="advantage-card card">
                        <div className="advantage-icon">🤖</div>
                        <h3>Integration Artificial Intelligence</h3>
                        <p>
                            Integrating AI into game design and coding, games align with modern player
                            expectations and surpass competitors.
                        </p>
                    </div>

                    <div className="advantage-card card">
                        <div className="advantage-icon">🏗️</div>
                        <h3>Building In-House Capabilities</h3>
                        <p>
                            DEX Studios actively develops in-house capabilities for financing, marketing,
                            and distribution, reducing reliance on publishers.
                        </p>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default Advantages;
