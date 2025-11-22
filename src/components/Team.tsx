import './Team.css';

const Team = () => {
    const teamMembers = [
        {
            name: 'Oleksii Vinogradov',
            role: 'Founder',
            description: 'Serial entrepreneur and investor with twenty-five years of experience. Founder of CFC, Heartln Inc. President/Owner of IXC Softswitch.',
            image: '/images/team/oleksii_vinogradov.jpg',
            linkedin: 'https://www.linkedin.com/in/oleksiivinogradov/'
        },
        {
            name: 'Oleg Bondar',
            role: 'CEO',
            description: 'Chief Executive Officer with 12+ years of experience in the position CEO company for the development of retail stores of various world brands.',
            image: '/images/team/oleg_bondar.jpeg',
            linkedin: 'https://www.linkedin.com/in/oleg-bondar-820710246'
        },
        {
            name: 'Eugene Luzgin',
            role: 'Angel Investor',
            description: 'Problem solver with diverse track record in software industry roles ranging from contributor to a startup founder. Responsible for Investor\'s relationships.',
            image: '/images/team/eugene_luzgin.jpeg',
            linkedin: 'https://www.linkedin.com/in/luzgin/'
        }
    ];

    return (
        <section className="team section">
            <div className="container">
                <div className="section-title">
                    <h2>Our Team</h2>
                    <p>From experienced developers to influencers</p>
                </div>

                <div className="team-grid grid grid-3">
                    {teamMembers.map((member, index) => (
                        <div key={index} className="team-card card" style={{ animationDelay: `${index * 0.1}s` }}>
                            <div className="team-avatar">
                                <img src={member.image} alt={member.name} />
                            </div>
                            <div className="team-role">{member.role}</div>
                            <h3>{member.name}</h3>
                            <p>{member.description}</p>
                            <div className="team-social">
                                <a href={member.linkedin} target="_blank" rel="noopener noreferrer" className="team-social-link" aria-label="LinkedIn">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
                                    </svg>
                                </a>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default Team;
