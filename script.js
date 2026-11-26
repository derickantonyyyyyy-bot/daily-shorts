
// ==========================================
// AI HUB V3 — SUPABASE + AI LAUNCHER
// ==========================================

// 1. SUPABASE CONFIGURATION
const SUPABASE_URL = "https://cbwrniumjrbzdvwomlnq.supabase.co";

// Replace this placeholder with your sb_publishable_ key.
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_ZlSgJ03SUD1-MQc7M8qU3g_dOiNUnHG";

// 2. CONNECT TO SUPABASE
const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
);

// ==========================================
// EXISTING AI PLATFORM LAUNCHER
// ==========================================

const aiPlatforms = {
    chatgpt: {
        name: "ChatGPT",
        url: "https://chatgpt.com/"
    },
    claude: {
        name: "Claude",
        url: "https://claude.ai/"
    },
    gemini: {
        name: "Gemini",
        url: "https://gemini.google.com/"
    }
};

// Restore the last-used AI.
function restoreWorkspace() {
    const lastUsed = localStorage.getItem("aiHubLastUsed");
    const display = document.getElementById("last-used");

    if (lastUsed && aiPlatforms[lastUsed] && display) {
        display.textContent =
            "Last opened: " + aiPlatforms[lastUsed].name;
    }
}

// Launch an AI platform.
function openAI(platform) {
    const ai = aiPlatforms[platform];

    if (!ai) {
        console.error("Unknown AI platform:", platform);
        return;
    }

    const newTab = window.open(
        ai.url,
        "_blank",
        "noopener,noreferrer"
    );

    if (newTab) {
        localStorage.setItem("aiHubLastUsed", platform);

        const display = document.getElementById("last-used");

        if (display) {
            display.textContent = "Last opened: " + ai.name;
        }
    }
}

// ==========================================
// SUPABASE AUTHENTICATION
// ==========================================

document.addEventListener("DOMContentLoaded", async () => {

    restoreWorkspace();

    const authForm = document.getElementById("auth-form");
    const emailInput = document.getElementById("auth-email");
    const passwordInput = document.getElementById("auth-password");
    const signupButton = document.getElementById("signup-button");
    const logoutButton = document.getElementById("logout-button");
    const message = document.getElementById("auth-message");

    function showMessage(text) {
        message.textContent = text;
    }

    function updateAuthUI(session) {
        authForm.hidden = !!session;
        logoutButton.hidden = !session;

        if (session && session.user) {
            showMessage("Signed in as " + session.user.email);
        } else {
            showMessage("Not signed in.");
        }
    }

    // Restore an existing login session.
    const { data: sessionData, error: sessionError } =
        await supabaseClient.auth.getSession();

    if (sessionError) {
        showMessage(sessionError.message);
    } else {
        updateAuthUI(sessionData.session);
    }

    // Watch for login and logout changes.
    supabaseClient.auth.onAuthStateChange((_event, session) => {
        updateAuthUI(session);
    });

    // SIGN IN
    authForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        const email = emailInput.value.trim();
        const password = passwordInput.value;

        showMessage("Signing in...");

        const { error } = await supabaseClient.auth.signInWithPassword({
            email,
            password
        });

        if (error) {
            showMessage("Login failed: " + error.message);
        } else {
            showMessage("Login successful!");
            passwordInput.value = "";
        }
    });
    
    // ==========================================
    // AI HUB — PRIVATE MP4 UPLOAD
    // ==========================================

    const videoForm = document.getElementById("video-form");
    const videoInput = document.getElementById("reference-video");
    const videoInstructions = document.getElementById("video-instructions");
    const uploadButton = document.getElementById("upload-button");
    const uploadMessage = document.getElementById("upload-message");

    if (videoForm) {
        videoForm.addEventListener("submit", async (event) => {
            event.preventDefault();

            const file = videoInput.files[0];

            if (!file) {
                uploadMessage.textContent = "Please select an MP4 video.";
                return;
            }

            // Maximum upload size: 100 MB
            if (file.size > 100 * 1024 * 1024) {
                uploadMessage.textContent = "Video must be smaller than 100 MB.";
                return;
            }

            if (
                file.type !== "video/mp4" &&
                !file.name.toLowerCase().endsWith(".mp4")
            ) {
                uploadMessage.textContent = "Please select an MP4 file.";
                return;
            }

            const { data: sessionData, error: sessionError } =
                await supabaseClient.auth.getSession();

            if (sessionError || !sessionData.session) {
                uploadMessage.textContent = "Please sign in first.";
                return;
            }

            const user = sessionData.session.user;

            const destinations = Array.from(
                videoForm.querySelectorAll(
                    'input[name="destination"]:checked'
                )
            ).map(input => input.value);

            if (destinations.length === 0) {
                uploadMessage.textContent =
                    "Select at least one publishing destination.";
                return;
            }

            const instructions = videoInstructions.value.trim();

            if (!instructions) {
                uploadMessage.textContent =
                    "Please enter your video instructions.";
                return;
            }

            const safeFilename = file.name.replace(
                /[^a-zA-Z0-9._-]/g,
                "_"
            );

            const storagePath =
                `${user.id}/${crypto.randomUUID()}-${safeFilename}`;

            uploadButton.disabled = true;
            uploadMessage.textContent = "Uploading your reference video...";

            try {
                // Upload to the private Supabase bucket.
                const { error: uploadError } =
                    await supabaseClient.storage
                        .from("reference-videos")
                        .upload(storagePath, file, {
                            contentType: "video/mp4",
                            upsert: false
                        });

                if (uploadError) {
                    throw uploadError;
                }

                uploadMessage.textContent =
                    "Video uploaded! Creating your automation job...";

                // Create the corresponding database record.
                const { data: job, error: jobError } =
                    await supabaseClient
                        .from("automation_jobs")
                        .insert({
                            user_id: user.id,
                            title: file.name,
                            instructions: instructions,
                            reference_video_path: storagePath,
                            destinations: destinations,
                            status: "draft",
                            resume_after_hours: 5,
                            approval_required: true
                        })
                        .select("id")
                        .single();

                if (jobError) {
                    // Remove uploaded file if job creation fails.
                    await supabaseClient.storage
                        .from("reference-videos")
                        .remove([storagePath]);

                    throw jobError;
                }

                uploadMessage.textContent =
                    "SUCCESS! Your video and automation job are saved. Job ID: " +
                    job.id;

                videoForm.reset();

            } catch (error) {
                console.error("AI HUB upload error:", error);

                uploadMessage.textContent =
                    "Upload failed: " + error.message;
            } finally {
                uploadButton.disabled = false;
            }
        });
    }


    // CREATE ACCOUNT
    signupButton.addEventListener("click", async () => {
        const email = emailInput.value.trim();
        const password = passwordInput.value;

        if (!email || !password) {
            showMessage("Enter your email and password first.");
            return;
        }

        showMessage("Creating your account...");

        const { data, error } = await supabaseClient.auth.signUp({
            email,
            password
        });

        if (error) {
            showMessage("Signup failed: " + error.message);
        } else if (data.session) {
            showMessage("Account created and signed in!");
            passwordInput.value = "";
        } else {
            showMessage(
                "Account created! Check your email if confirmation is required."
            );
        }
    });

    // SIGN OUT
    logoutButton.addEventListener("click", async () => {
        showMessage("Signing out...");

        const { error } = await supabaseClient.auth.signOut();

        if (error) {
            showMessage("Logout failed: " + error.message);
        } else {
            showMessage("You have signed out.");
        }
    });

});
